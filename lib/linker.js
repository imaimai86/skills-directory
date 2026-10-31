import fs from 'node:fs/promises';
import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const AGENTS = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    path: path.join(os.homedir(), '.claude', 'skills'),
    protected: ['synced']
  },
  agy: {
    id: 'agy',
    name: 'Antigravity (AGY)',
    path: path.join(os.homedir(), '.gemini', 'config', 'skills'),
    protected: []
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    path: path.join(os.homedir(), '.codex', 'skills'),
    protected: ['.system']
  }
};

export const PERSISTENT_STORE = path.join(os.homedir(), '.agents', 'skills');

export async function isGitRepo(dirPath) {
  try {
    const stat = await fs.stat(path.join(dirPath, '.git'));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Ensures canonical skills are safely accessible.
 * If running from an ephemeral/global npm install (not git repo),
 * copies them to PERSISTENT_STORE (~/.agents/skills) so symlinks never break.
 */
export async function getCanonicalSource(packageRoot, preferPersistent = false) {
  const localSkills = path.join(packageRoot, 'skills');
  const isLocalGit = await isGitRepo(packageRoot);

  if (isLocalGit && !preferPersistent) {
    return {
      type: 'repo',
      baseDir: localSkills
    };
  }

  // Persistent store mode
  await fs.mkdir(PERSISTENT_STORE, { recursive: true });
  return {
    type: 'persistent',
    baseDir: PERSISTENT_STORE
  };
}

export async function copySkillToStore(sourceSkillPath, destSkillPath) {
  await fs.mkdir(destSkillPath, { recursive: true });
  await fs.cp(sourceSkillPath, destSkillPath, { recursive: true, force: true });
}

export async function linkSkill(skillId, canonicalSkillPath, agentKey, options = {}) {
  const { dryRun = false } = options;
  const agent = AGENTS[agentKey];
  if (!agent) {
    throw new Error(`Unknown agent: ${agentKey}`);
  }

  if (agent.protected.includes(skillId)) {
    return { status: 'skipped', reason: 'protected path', skillId, agent: agent.id };
  }

  const destPath = path.join(agent.path, skillId);
  const targetAbs = path.resolve(canonicalSkillPath);

  if (!dryRun) {
    await fs.mkdir(agent.path, { recursive: true });
  }

  let existingStat = null;
  try {
    existingStat = await fs.lstat(destPath);
  } catch {
    existingStat = null;
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
        return { status: 'already-linked', destPath, target: targetAbs, agent: agent.id, skillId };
      }

      // Existing symlink points somewhere else: replace atomically
      if (!dryRun) {
        await fs.unlink(destPath);
        await fs.symlink(targetAbs, destPath, 'dir');
      }
      return { status: 'updated-link', destPath, previousTarget: currentAbs, target: targetAbs, agent: agent.id, skillId };
    } else if (existingStat.isDirectory()) {
      // Physical directory: backup before replacing with symlink
      const backupPath = `${destPath}.backup.${Date.now()}`;
      if (!dryRun) {
        await fs.rename(destPath, backupPath);
        await fs.symlink(targetAbs, destPath, 'dir');
      }
      return { status: 'replaced-dir', backupPath, destPath, target: targetAbs, agent: agent.id, skillId };
    }
  }

  // Create new symlink
  if (!dryRun) {
    await fs.symlink(targetAbs, destPath, 'dir');
  }
  return { status: 'linked', destPath, target: targetAbs, agent: agent.id, skillId };
}

export async function unlinkSkill(skillId, agentKey, options = {}) {
  const { dryRun = false } = options;
  const agent = AGENTS[agentKey];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);

  if (agent.protected.includes(skillId)) {
    return { status: 'skipped', reason: 'protected path', skillId, agent: agent.id };
  }

  const destPath = path.join(agent.path, skillId);
  let stat = null;
  try {
    stat = await fs.lstat(destPath);
  } catch {
    return { status: 'not-found', destPath, skillId, agent: agent.id };
  }

  if (stat.isSymbolicLink()) {
    if (!dryRun) {
      await fs.unlink(destPath);
    }
    return { status: 'unlinked', destPath, skillId, agent: agent.id };
  }

  return { status: 'skipped', reason: 'physical directory or file (not a symlink)', destPath, skillId, agent: agent.id };
}

export function inspectAgentSkills(skillsList) {
  const statusReport = {};

  for (const [agentKey, agent] of Object.entries(AGENTS)) {
    statusReport[agentKey] = {
      name: agent.name,
      path: agent.path,
      exists: existsSync(agent.path),
      skills: {}
    };

    if (!existsSync(agent.path)) continue;

    for (const skill of skillsList) {
      const destPath = path.join(agent.path, skill.id);
      if (agent.protected.includes(skill.id)) {
        statusReport[agentKey].skills[skill.id] = { type: 'protected' };
        continue;
      }

      if (!existsSync(destPath)) {
        try {
          const lstat = lstatSync(destPath);
          if (lstat.isSymbolicLink()) {
            statusReport[agentKey].skills[skill.id] = { type: 'broken-symlink', target: readlinkSync(destPath) };
            continue;
          }
        } catch {
          statusReport[agentKey].skills[skill.id] = { type: 'not-installed' };
          continue;
        }
      }

      const lstat = lstatSync(destPath);
      if (lstat.isSymbolicLink()) {
        const target = readlinkSync(destPath);
        statusReport[agentKey].skills[skill.id] = { type: 'symlink', target };
      } else if (lstat.isDirectory()) {
        statusReport[agentKey].skills[skill.id] = { type: 'physical-dir' };
      } else {
        statusReport[agentKey].skills[skill.id] = { type: 'file' };
      }
    }
  }

  return statusReport;
}
