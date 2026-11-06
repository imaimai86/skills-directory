import fs from 'node:fs/promises';
import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AGENTS, BACKUP_ROOT, PERSISTENT_STORE, getBackupPath, isGitRepo } from './linker.js';
import { parseFrontmatter } from './scanner.js';
import {
  discoverClaudeAccountSkills,
  importClaudeAccountSkill,
  linkClaudeAccountSkill
} from './claude-account.js';

const execFileAsync = promisify(execFile);

export const KNOWN_AGENTS = {
  ...AGENTS,
  antigravity: AGENTS.agy,
  gemini: AGENTS.agy,
  cursor: {
    id: 'cursor',
    name: 'Cursor',
    path: path.join(os.homedir(), '.cursor', 'skills'),
    protected: []
  },
  windsurf: {
    id: 'windsurf',
    name: 'Windsurf',
    path: path.join(os.homedir(), '.codeium', 'windsurf', 'skills'),
    protected: []
  },
  cline: {
    id: 'cline',
    name: 'Cline',
    path: path.join(os.homedir(), '.cline', 'skills'),
    protected: []
  },
  amp: {
    id: 'amp',
    name: 'Amp',
    path: path.join(os.homedir(), '.amp', 'skills'),
    protected: []
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    path: path.join(os.homedir(), '.opencode', 'skills'),
    protected: []
  }
};

/**
 * Expand tilde (~) and resolve path relative to current working directory.
 */
export function expandPath(filePath) {
  if (!filePath) return filePath;
  if (filePath === '~') return os.homedir();
  if (filePath.startsWith('~/') || filePath.startsWith('~\\')) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return path.resolve(filePath);
}

/**
 * Resolve an agent identifier or directory path.
 */
export function resolveSource(sourceInput) {
  if (!sourceInput) return null;

  const trimmed = sourceInput.trim();
  const lower = trimmed.toLowerCase();

  // Claude account skills
  if (lower === 'claude-account' || lower === 'account') {
    const claudePath = AGENTS.claude?.path || path.join(os.homedir(), '.claude', 'skills');
    return {
      id: 'claude-account',
      name: 'Claude Account (synced)',
      path: path.join(claudePath, 'synced'),
      isAgent: true,
      isAccount: true
    };
  }

  // Known agent
  if (KNOWN_AGENTS[lower]) {
    const ag = KNOWN_AGENTS[lower];
    return {
      id: ag.id,
      name: ag.name,
      path: ag.path,
      isAgent: true
    };
  }

  // "name=/path" syntax
  if (trimmed.includes('=')) {
    const [name, rawPath] = trimmed.split('=', 2);
    const resolved = expandPath(rawPath.trim());
    return {
      id: name.trim().toLowerCase(),
      name: name.trim(),
      path: resolved,
      isAgent: true
    };
  }

  // Arbitrary directory path
  const resolved = expandPath(trimmed);
  return {
    id: path.basename(resolved).toLowerCase(),
    name: path.basename(resolved),
    path: resolved,
    isAgent: false
  };
}

/**
 * Execute a git command with arguments safely without shell injection.
 */
export async function runGit(args, cwd) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, { cwd });
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return {
      success: false,
      stdout: err.stdout ? String(err.stdout).trim() : '',
      stderr: err.stderr ? String(err.stderr).trim() : err.message,
      error: err
    };
  }
}

/**
 * Scans all agent directories, persistent store, and local repo for skills.
 */
export async function discoverAgentSkills(repoRoot, customAgents = {}, options = {}) {
  const { includeAccount = true } = options;
  const allAgents = { ...KNOWN_AGENTS, ...customAgents };
  const skillsFound = [];
  const repoSkillsDir = path.join(repoRoot, 'skills');

  // Helper to scan a single directory of skills
  async function scanDir(dirPath, agentId, agentName, isRepo = false) {
    if (!existsSync(dirPath)) return;

    let entries = [];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.system') continue;
      const fullPath = path.join(dirPath, entry.name);

      let isSymlink = false;
      let isDir = false;
      let target = null;
      let realPath = fullPath;

      try {
        const lstat = await fs.lstat(fullPath);
        isSymlink = lstat.isSymbolicLink();
        if (isSymlink) {
          target = await fs.readlink(fullPath);
          realPath = path.resolve(path.dirname(fullPath), target);
        } else if (lstat.isDirectory()) {
          isDir = true;
        } else {
          continue; // skip regular loose files
        }
      } catch {
        continue;
      }

      // Check for SKILL.md
      const skillMdPath = path.join(realPath, 'SKILL.md');
      const hasSkillMd = existsSync(skillMdPath);
      let metadata = { description: '' };
      if (hasSkillMd) {
        metadata = await parseFrontmatter(skillMdPath);
      }

      let type = 'physical-dir';
      if (isRepo) {
        type = 'repo';
      } else if (isSymlink) {
        const expectedRepoTarget = path.resolve(path.join(repoSkillsDir, entry.name));
        if (realPath === expectedRepoTarget) {
          type = 'repo-symlink';
        } else {
          type = 'external-symlink';
        }
      }

      const inRepo = existsSync(path.join(repoSkillsDir, entry.name));

      skillsFound.push({
        skillId: entry.name,
        name: metadata.name || entry.name,
        description: metadata.description || '',
        agentId,
        agentName,
        skillPath: fullPath,
        realPath,
        target,
        type,
        hasSkillMd,
        inRepo
      });
    }
  }

  // 1. Scan active agent directories (only if they exist on disk)
  const scannedPaths = new Set();
  for (const [agentKey, agent] of Object.entries(allAgents)) {
    if (scannedPaths.has(agent.path)) continue;
    scannedPaths.add(agent.path);
    await scanDir(agent.path, agent.id, agent.name, false);
  }

  // 2. Scan Persistent Store (~/.agents/skills)
  if (!scannedPaths.has(PERSISTENT_STORE)) {
    scannedPaths.add(PERSISTENT_STORE);
    await scanDir(PERSISTENT_STORE, 'store', 'Persistent Store (~/.agents/skills)', false);
  }

  // 3. Scan Repo skills/
  if (existsSync(repoSkillsDir)) {
    await scanDir(repoSkillsDir, 'repo', 'Repo Skills', true);
  }

  // 4. Scan Claude Account (synced) skills if enabled
  if (includeAccount) {
    try {
      const accountSkills = await discoverClaudeAccountSkills({ repoRoot });
      skillsFound.push(...accountSkills);
    } catch {
      // ignore
    }
  }

  return skillsFound;
}

/**
 * Locate a skill by id across known agents or within a specific source.
 */
export async function findSkill(skillId, sourceKeyOrPath, repoRoot) {
  const repoSkillsDir = path.join(repoRoot, 'skills');

  // If sourceKeyOrPath is specified
  if (sourceKeyOrPath) {
    const lower = sourceKeyOrPath.trim().toLowerCase();
    if (lower === 'claude-account' || lower === 'account') {
      return discoverClaudeAccountSkills({ repoRoot, skillId });
    }

    const resolved = resolveSource(sourceKeyOrPath);
    if (!resolved) {
      throw new Error(`Invalid source: ${sourceKeyOrPath}`);
    }

    // Check if the resolved path itself is the skill directory (e.g. /path/to/my-skill)
    const directSkillMd = path.join(resolved.path, 'SKILL.md');
    if (existsSync(directSkillMd) || path.basename(resolved.path) === skillId) {
      const isSymlink = lstatSync(resolved.path).isSymbolicLink();
      const realPath = isSymlink
        ? path.resolve(path.dirname(resolved.path), await fs.readlink(resolved.path))
        : resolved.path;
      const metadata = existsSync(directSkillMd) ? await parseFrontmatter(directSkillMd) : {};
      return [{
        skillId: skillId || path.basename(resolved.path),
        name: metadata.name || skillId || path.basename(resolved.path),
        description: metadata.description || '',
        agentId: resolved.id,
        agentName: resolved.name,
        skillPath: resolved.path,
        realPath,
        type: isSymlink ? 'symlink' : 'physical-dir',
        hasSkillMd: existsSync(directSkillMd),
        inRepo: existsSync(path.join(repoSkillsDir, skillId || path.basename(resolved.path)))
      }];
    }

    // Otherwise look inside resolved.path for skillId
    const candidatePath = path.join(resolved.path, skillId);
    if (existsSync(candidatePath)) {
      const isSymlink = lstatSync(candidatePath).isSymbolicLink();
      const realPath = isSymlink
        ? path.resolve(path.dirname(candidatePath), await fs.readlink(candidatePath))
        : candidatePath;
      const skillMd = path.join(realPath, 'SKILL.md');
      const hasSkillMd = existsSync(skillMd);
      const metadata = hasSkillMd ? await parseFrontmatter(skillMd) : {};
      return [{
        skillId,
        name: metadata.name || skillId,
        description: metadata.description || '',
        agentId: resolved.id,
        agentName: resolved.name,
        skillPath: candidatePath,
        realPath,
        type: isSymlink ? 'symlink' : 'physical-dir',
        hasSkillMd,
        inRepo: existsSync(path.join(repoSkillsDir, skillId))
      }];
    }

    return [];
  }

  // If no source specified, search across all discovered skills
  const allSkills = await discoverAgentSkills(repoRoot);
  const matches = allSkills.filter(s => s.skillId.toLowerCase() === skillId.toLowerCase());

  // Also check if it's directly in repo
  const repoSkillPath = path.join(repoSkillsDir, skillId);
  if (existsSync(repoSkillPath) && !matches.some(m => m.type === 'repo')) {
    const skillMd = path.join(repoSkillPath, 'SKILL.md');
    const hasSkillMd = existsSync(skillMd);
    const metadata = hasSkillMd ? await parseFrontmatter(skillMd) : {};
    matches.push({
      skillId,
      name: metadata.name || skillId,
      description: metadata.description || '',
      agentId: 'repo',
      agentName: 'Repository Skills',
      skillPath: repoSkillPath,
      realPath: repoSkillPath,
      type: 'repo',
      hasSkillMd,
      inRepo: true
    });
  }

  return matches;
}

/**
 * Safeguard: Copies the skill to a timestamped backup directory.
 */
export async function backupSkill(sourcePath, skillId, agentId = 'imported', options = {}) {
  const { backupRoot = BACKUP_ROOT, dryRun = false } = options;
  const backupDir = getBackupPath(agentId, skillId, backupRoot);

  if (dryRun) {
    return { status: 'dry-run', backupDir };
  }

  await fs.mkdir(path.dirname(backupDir), { recursive: true });
  const realSource = await fs.realpath(sourcePath);

  await fs.cp(realSource, backupDir, {
    recursive: true,
    force: true,
    filter: (src) => !src.includes('/.git') && !src.includes('/node_modules') && !path.basename(src).startsWith('.DS_Store')
  });

  return { status: 'backed-up', backupDir };
}

/**
 * Copies skill directory into canonical repo skills/<skillId>.
 */
export async function importSkillToRepo(sourcePath, skillId, repoRoot, options = {}) {
  const { dryRun = false, agentName = 'agent' } = options;
  const targetDir = path.join(repoRoot, 'skills', skillId);

  let realSource = '';
  try {
    realSource = await fs.realpath(sourcePath);
  } catch {
    realSource = path.resolve(sourcePath);
  }

  let realTarget = '';
  try {
    realTarget = existsSync(targetDir) ? await fs.realpath(targetDir) : path.resolve(targetDir);
  } catch {
    realTarget = path.resolve(targetDir);
  }

  if (realSource === realTarget) {
    return { status: 'same-path', targetDir };
  }

  if (dryRun) {
    return { status: 'dry-run', targetDir };
  }

  await fs.mkdir(targetDir, { recursive: true });
  await fs.cp(realSource, targetDir, {
    recursive: true,
    force: true,
    filter: (src) => !src.includes('/.git') && !src.includes('/node_modules') && !path.basename(src).startsWith('.DS_Store')
  });

  // Ensure valid SKILL.md exists
  const skillMdPath = path.join(targetDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    const defaultContent = `---
name: ${skillId}
description: Skill imported from ${agentName}
---

# ${skillId}

Curated multi-agent skill managed by @imaimai86/skills-directory.
`;
    await fs.writeFile(skillMdPath, defaultContent, 'utf-8');
  }

  return { status: 'imported', targetDir };
}

/**
 * Replaces the original agent skill directory/symlink with a symlink to repo.
 */
export async function relinkAgentSkill(agentSkillPath, targetRepoSkillPath, options = {}) {
  const { dryRun = false, symlink = true } = options;
  if (!symlink) {
    return { status: 'skipped', reason: 'symlink disabled' };
  }

  const targetAbs = path.resolve(targetRepoSkillPath);
  const linkAbs = path.resolve(agentSkillPath);

  if (targetAbs === linkAbs) {
    return { status: 'same-path', linkPath: agentSkillPath };
  }

  if (dryRun) {
    return { status: 'dry-run', linkPath: agentSkillPath, target: targetAbs };
  }

  // Remove existing file or directory
  await fs.rm(agentSkillPath, { recursive: true, force: true });
  // Create symlink
  await fs.symlink(targetAbs, agentSkillPath, 'dir');

  return { status: 'relinked', linkPath: agentSkillPath, target: targetAbs };
}

/**
 * Git stage, commit, and push skill changes.
 */
export async function commitAndPushSkill(skillId, repoRoot, options = {}) {
  const {
    message,
    noPush = false,
    dryRun = false,
    agentName = 'agent'
  } = options;

  const isRepo = await isGitRepo(repoRoot);
  if (!isRepo) {
    return { status: 'not-a-git-repo', error: 'Target directory is not a git repository' };
  }

  const relativeSkillPath = path.join('skills', skillId);
  const commitMsg = message || `feat(skills): backup and add ${skillId} from ${agentName}`;

  if (dryRun) {
    return {
      status: 'dry-run',
      staged: true,
      commitMessage: commitMsg,
      pushed: !noPush
    };
  }

  // 1. Git add
  const addRes = await runGit(['add', relativeSkillPath], repoRoot);
  if (!addRes.success) {
    return { status: 'add-failed', error: addRes.stderr };
  }

  // 2. Check if there are staged changes
  const diffRes = await runGit(['diff', '--cached', '--name-only', '--', relativeSkillPath], repoRoot);
  const hasStagedChanges = diffRes.stdout.length > 0;

  let commitHash = null;

  if (hasStagedChanges) {
    const commitRes = await runGit(['commit', '-m', commitMsg, '--', relativeSkillPath], repoRoot);
    if (!commitRes.success) {
      return { status: 'commit-failed', error: commitRes.stderr };
    }
    const logRes = await runGit(['rev-parse', '--short', 'HEAD'], repoRoot);
    commitHash = logRes.stdout;
  }

  // 3. Push to remote
  if (noPush) {
    return {
      status: hasStagedChanges ? 'committed' : 'up-to-date',
      commitHash,
      commitMessage: commitMsg,
      noPush: true
    };
  }

  const pushRes = await runGit(['push'], repoRoot);
  if (!pushRes.success) {
    // If upstream branch is not set, try pushing with --set-upstream origin <branch>
    if (pushRes.stderr.includes('--set-upstream') || pushRes.stderr.includes('has no upstream branch')) {
      const branchRes = await runGit(['branch', '--show-current'], repoRoot);
      const branch = branchRes.stdout || 'main';
      const retryPush = await runGit(['push', '-u', 'origin', branch], repoRoot);
      if (retryPush.success) {
        return {
          status: 'pushed',
          commitHash,
          commitMessage: commitMsg
        };
      }
    }
    return {
      status: 'push-failed',
      commitHash,
      commitMessage: commitMsg,
      error: pushRes.stderr
    };
  }

  return {
    status: 'pushed',
    commitHash,
    commitMessage: commitMsg
  };
}

/**
 * End-to-end backup, import, relink, and git push for a single skill.
 */
export async function backupAndPushSkill(skillInput, options = {}) {
  const {
    from,
    repoRoot,
    dryRun = false,
    noPush = false,
    noSymlink = false,
    message,
    backupRoot = BACKUP_ROOT
  } = options;

  let skillObj = null;

  if (typeof skillInput === 'object' && skillInput.skillPath) {
    skillObj = skillInput;
  } else {
    const matches = await findSkill(skillInput, from, repoRoot);
    if (matches.length === 0) {
      throw new Error(`Skill "${skillInput}" not found${from ? ` in ${from}` : ''}.`);
    }
    // Prefer physical directory or external symlink over repo
    skillObj = matches.find(m => m.type === 'physical-dir') || matches[0];
  }

  const skillId = skillObj.skillId;
  const agentId = skillObj.agentId;
  const agentName = skillObj.agentName;
  const sourcePath = skillObj.skillPath;

  // Account-synced skills safeguard: never modify files inside synced/
  if (skillObj.isAccountSynced) {
    const importRes = await importClaudeAccountSkill(skillObj, repoRoot, { dryRun });
    let relinkRes = [];
    if (!noSymlink) {
      const canonicalSkillPath = path.join(repoRoot, 'skills', skillId);
      relinkRes = await linkClaudeAccountSkill(skillId, canonicalSkillPath, ['claude', 'agy'], { dryRun });
    }
    const gitRes = importRes.status === 'imported'
      ? await commitAndPushSkill(skillId, repoRoot, {
          message: message || `import ${skillId} from claude account`,
          noPush,
          dryRun,
          agentName: 'claude account'
        })
      : { status: 'skipped', reason: 'already central' };

    return {
      skillId,
      agentId,
      agentName,
      sourcePath,
      backupRes: { status: 'skipped', reason: 'read-only account source' },
      importRes,
      relinkRes,
      gitRes
    };
  }

  // Step 1: Backup
  const backupRes = await backupSkill(sourcePath, skillId, agentId, { backupRoot, dryRun });

  // Step 2: Import into repo
  const importRes = await importSkillToRepo(sourcePath, skillId, repoRoot, { dryRun, agentName });

  // Step 3: Relink original source if it was inside an agent path
  let relinkRes = { status: 'skipped' };
  if (!noSymlink && skillObj.type !== 'repo' && skillObj.type !== 'repo-symlink') {
    relinkRes = await relinkAgentSkill(sourcePath, importRes.targetDir, { dryRun, symlink: true });
  }

  // Step 4: Commit and push
  const gitRes = await commitAndPushSkill(skillId, repoRoot, {
    message,
    noPush,
    dryRun,
    agentName
  });

  return {
    skillId,
    agentId,
    agentName,
    sourcePath,
    backupRes,
    importRes,
    relinkRes,
    gitRes
  };
}
