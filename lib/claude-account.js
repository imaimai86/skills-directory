import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AGENTS, BACKUP_ROOT, linkSkill } from './linker.js';
import { parseFrontmatter } from './scanner.js';
import { commitAndPushSkill } from './backup-push.js';

export function getClaudeSyncedDir(customClaudePath) {
  const baseClaude = customClaudePath || AGENTS.claude?.path || path.join(os.homedir(), '.claude', 'skills');
  return path.join(baseClaude, 'synced');
}

/**
 * Recursively discovers skills inside ~/.claude/skills/synced/
 * Excludes .staging, .bucket-*, node_modules, .git.
 */
export async function discoverClaudeAccountSkills(options = {}) {
  const {
    claudePath = AGENTS.claude?.path || path.join(os.homedir(), '.claude', 'skills'),
    repoRoot,
    skillId: filterSkillId
  } = options;

  const syncedDir = path.join(claudePath, 'synced');
  if (!existsSync(syncedDir)) {
    return [];
  }

  const repoSkillsDir = repoRoot ? path.join(repoRoot, 'skills') : null;
  const discovered = [];
  const visitedSkillIds = new Set();

  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    // Check if current directory has SKILL.md
    const hasSkillMd = entries.some(e => e.isFile() && e.name === 'SKILL.md');
    if (hasSkillMd) {
      const skillName = path.basename(dir);
      if (!visitedSkillIds.has(skillName)) {
        if (!filterSkillId || skillName.toLowerCase() === filterSkillId.toLowerCase()) {
          const skillMdPath = path.join(dir, 'SKILL.md');
          const metadata = await parseFrontmatter(skillMdPath);
          const inRepo = repoSkillsDir ? existsSync(path.join(repoSkillsDir, skillName)) : false;

          let realPath = dir;
          try {
            realPath = await fs.realpath(dir);
          } catch {
            realPath = dir;
          }

          visitedSkillIds.add(skillName);
          discovered.push({
            skillId: skillName,
            name: metadata.name || skillName,
            description: metadata.description || '',
            skillPath: dir,
            realPath,
            skillMdPath,
            hasSkillMd: true,
            isAccountSynced: true,
            agentId: 'claude-account',
            agentName: 'Claude Account (synced)',
            inRepo
          });
        }
      }
      return; // Do not recurse into nested directories within a skill
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip non-skill or internal staging/temp directories
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.staging' ||
        entry.name.startsWith('.bucket-')
      ) {
        continue;
      }
      await walk(path.join(dir, entry.name));
    }
  }

  await walk(syncedDir);
  discovered.sort((a, b) => a.skillId.localeCompare(b.skillId));
  return discovered;
}

/**
 * Safe copy of account skill into <repoRoot>/skills/<skillId>.
 * NEVER overwrites an existing central copy.
 * NEVER modifies the synced/ folder.
 */
export async function importClaudeAccountSkill(skillObj, repoRoot, options = {}) {
  const { dryRun = false } = options;
  const targetDir = path.join(repoRoot, 'skills', skillObj.skillId);

  if (existsSync(targetDir)) {
    return {
      status: 'skipped',
      reason: 'already central',
      skillId: skillObj.skillId,
      targetDir
    };
  }

  if (dryRun) {
    return {
      status: 'imported',
      dryRun: true,
      skillId: skillObj.skillId,
      targetDir
    };
  }

  await fs.mkdir(targetDir, { recursive: true });
  await fs.cp(skillObj.skillPath, targetDir, {
    recursive: true,
    force: false,
    filter: (src) => !src.includes('/.git') && !src.includes('/node_modules') && !path.basename(src).startsWith('.DS_Store')
  });

  return {
    status: 'imported',
    skillId: skillObj.skillId,
    targetDir
  };
}

/**
 * Links central skill into target agent directories and checks name clashes.
 * Uses atomic symlink replacement, preserves physical directories with .bak-<timestamp>,
 * and skips creating links inside synced/.
 */
export async function linkClaudeAccountSkill(skillId, canonicalSkillPath, targetAgentKeys = ['claude', 'agy'], options = {}) {
  const {
    dryRun = false,
    claudePath = AGENTS.claude?.path || path.join(os.homedir(), '.claude', 'skills'),
    syncedDir = path.join(claudePath, 'synced'),
    backupRoot = BACKUP_ROOT,
    allAgents = AGENTS
  } = options;

  const results = [];
  const targetAbs = path.resolve(canonicalSkillPath);

  for (const agentKey of targetAgentKeys) {
    const agent = allAgents[agentKey];
    if (!agent) continue;

    const agentDir = agent.path;
    const destPath = path.join(agentDir, skillId);

    // Safeguard: Never link inside synced/
    if (destPath.startsWith(syncedDir)) {
      results.push({
        agentKey,
        skillId,
        status: 'skipped',
        reason: 'cannot create link inside synced/ directory'
      });
      continue;
    }

    if (!dryRun) {
      await fs.mkdir(agentDir, { recursive: true });
    }

    let existingStat = null;
    try {
      existingStat = await fs.lstat(destPath);
    } catch {
      existingStat = null;
    }

    // Check clash: does this skill also exist under synced/?
    let hasClash = false;
    if (agentKey === 'claude') {
      const clashMatches = await discoverClaudeAccountSkills({ claudePath, skillId });
      if (clashMatches.length > 0) {
        hasClash = true;
      }
    }

    if (existingStat) {
      if (existingStat.isSymbolicLink()) {
        let currentLink = '';
        try {
          currentLink = await fs.readlink(destPath);
        } catch {
          currentLink = '';
        }
        const currentAbs = path.resolve(path.dirname(destPath), currentLink);
        if (currentAbs === targetAbs) {
          results.push({
            agentKey,
            agentName: agent.name,
            skillId,
            status: 'already-linked',
            destPath,
            target: targetAbs,
            hasClash
          });
          continue;
        }

        // Symlink points elsewhere: update link
        if (!dryRun) {
          await fs.unlink(destPath);
          await fs.symlink(targetAbs, destPath, 'dir');
        }
        results.push({
          agentKey,
          agentName: agent.name,
          skillId,
          status: 'updated-link',
          destPath,
          previousTarget: currentAbs,
          target: targetAbs,
          hasClash
        });
      } else if (existingStat.isDirectory()) {
        // Physical directory: backup to <destPath>.bak-<timestamp>
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `${destPath}.bak-${timestamp}`;
        if (!dryRun) {
          await fs.rename(destPath, backupPath);
          await fs.symlink(targetAbs, destPath, 'dir');
        }
        results.push({
          agentKey,
          agentName: agent.name,
          skillId,
          status: 'replaced-dir',
          backupPath,
          destPath,
          target: targetAbs,
          hasClash
        });
      }
    } else {
      // New symlink
      if (!dryRun) {
        await fs.symlink(targetAbs, destPath, 'dir');
      }
      results.push({
        agentKey,
        agentName: agent.name,
        skillId,
        status: 'linked',
        destPath,
        target: targetAbs,
        hasClash
      });
    }
  }

  return results;
}

/**
 * Orchestrates full account skill backup, import, link, and git push.
 */
export async function backupAndPushClaudeAccountSkills(options = {}) {
  const {
    repoRoot,
    skillId,
    claudePath,
    targetAgentKeys = ['claude', 'agy'],
    dryRun = false,
    noPush = false,
    message
  } = options;

  const discovered = await discoverClaudeAccountSkills({
    claudePath,
    repoRoot,
    skillId
  });

  const operations = [];

  for (const skill of discovered) {
    // 1. Import
    const importRes = await importClaudeAccountSkill(skill, repoRoot, { dryRun });

    // 2. Link
    const linkRes = await linkClaudeAccountSkill(skill.skillId, path.join(repoRoot, 'skills', skill.skillId), targetAgentKeys, {
      dryRun,
      claudePath
    });

    // 3. Git commit if imported
    let gitRes = { status: 'skipped' };
    if (importRes.status === 'imported') {
      const commitMsg = message || `import ${skill.skillId} from claude account`;
      gitRes = await commitAndPushSkill(skill.skillId, repoRoot, {
        message: commitMsg,
        dryRun,
        noPush,
        agentName: 'claude account'
      });
    }

    operations.push({
      skillId: skill.skillId,
      skill,
      importRes,
      linkRes,
      gitRes
    });
  }

  return {
    discovered,
    operations
  };
}
