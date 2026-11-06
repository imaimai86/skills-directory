#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { scanSkills } from '../lib/scanner.js';
import {
  AGENTS,
  PERSISTENT_STORE,
  getCanonicalSource,
  copySkillToStore,
  checkSkillConflict,
  linkSkill,
  unlinkSkill,
  inspectAgentSkills
} from '../lib/linker.js';
import {
  KNOWN_AGENTS,
  discoverAgentSkills,
  findSkill,
  backupAndPushSkill,
  resolveSource,
  commitAndPushSkill
} from '../lib/backup-push.js';
import {
  discoverClaudeAccountSkills,
  importClaudeAccountSkill,
  linkClaudeAccountSkill
} from '../lib/claude-account.js';
import { multiSelect, confirm } from '../lib/prompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..');

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m'
};

async function getPackageVersion() {
  try {
    const pkgJson = JSON.parse(await fs.readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf-8'));
    return pkgJson.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function printHelp() {
  console.log(`
${ANSI.bold}${ANSI.cyan}skills-directory${ANSI.reset} - Multi-agent skill manager for Claude Code, Antigravity, Codex & more

${ANSI.bold}USAGE:${ANSI.reset}
  skills-directory [COMMAND] [OPTIONS]
  npx @imaimai86/skills-directory [COMMAND] [OPTIONS]

${ANSI.bold}COMMANDS:${ANSI.reset}
  push, backup [SKILL]        Backup, import, relink, and push a skill to repo from any agent
  backup-account [SKILL]      Backup & import Claude account-synced skills into repo and link
  sync                        Sync all canonical skills to all supported agents
  status                      Show current installation and symlink status across agents
  unlink                      Unlink selected skills from selected agent paths
  list                        List all available canonical skills in repo

${ANSI.bold}OPTIONS:${ANSI.reset}
  -f, --from=<agent|path>     Source agent (claude, claude-account, agy, codex, etc.) or custom path
      --account               Target Claude account-synced skills (~/.claude/skills/synced/)
      --skill=<name>          Skill identifier to backup and push
  -m, --message=<msg>         Custom git commit message
      --no-push               Backup, import, and commit locally without pushing to git remote
      --no-symlink            Keep original source in agent without replacing with symlink to repo
  -a, --all                   Process all discovered skills across agents
  -s, --status                Show current installation/symlink status across all agents
  -l, --list                  List all available canonical skills with descriptions
  -u, --unlink                Unlink selected skills from selected agent paths
  -p, --push                  Trigger backup and push workflow
  -b, --backup                Alias for --push
  -d, --dry-run               Simulate actions without making filesystem or git modifications
  -y, --yes                   Skip interactive confirmation prompts
      --skills=<list|all>     Comma-separated list of skill IDs (or 'all')
      --agents=<list|all>     Target agent runtimes: claude, agy, codex (or 'all')
      --store=<repo|persist>  Force source store: 'repo' (direct symlink) or 'persist' (~/.agents/skills)
  -h, --help                  Display this help message
  -v, --version               Display version information

${ANSI.bold}EXAMPLES:${ANSI.reset}
  ${ANSI.gray}# Backup and push a skill from Claude Code to repository and git:${ANSI.reset}
  skills-directory push context7-mcp --from=claude

  ${ANSI.gray}# Auto-discover a skill across agents and push to git:${ANSI.reset}
  skills-directory push context7-mcp

  ${ANSI.gray}# Backup and push from custom agent directory or path:${ANSI.reset}
  skills-directory push my-skill --from=~/.cursor/skills

  ${ANSI.gray}# Interactive selection of skills across all agent runtimes:${ANSI.reset}
  skills-directory push

  ${ANSI.gray}# Push with custom commit message and dry-run preview:${ANSI.reset}
  skills-directory push deepen -m "feat: enhance prompt rigor" --dry-run

  ${ANSI.gray}# Sync canonical skills into Claude and Antigravity:${ANSI.reset}
  skills-directory --skills=all --agents=claude,agy
`);
}

async function handlePushCommand({ positionals, values, dryRun, skipConfirm }) {
  console.log(`\n${ANSI.bold}${ANSI.cyan}🚀 Skills Directory: Backup & Push to Repository${ANSI.reset}\n`);

  if (dryRun) {
    console.log(`${ANSI.yellow}${ANSI.bold}[DRY RUN MODE]${ANSI.reset} Simulating operations. No filesystem or git modifications.\n`);
  }

  const requestedSkillId = positionals[1] || values.skill || (values.skills && !values.skills.includes(',') ? values.skills : null);
  const sourceAgentOrPath = values.from || null;
  const customMessage = values.message || values.m || null;
  const noPush = Boolean(values['no-push']);
  const noSymlink = Boolean(values['no-symlink']);
  const isAll = Boolean(values.all || (requestedSkillId && requestedSkillId.toLowerCase() === 'all'));

  let skillsToProcess = [];

  if (isAll) {
    const allDiscovered = await discoverAgentSkills(PACKAGE_ROOT);
    // Filter out duplicates if present across multiple agents, preferring physical-dir
    const uniqueMap = new Map();
    for (const item of allDiscovered) {
      if (item.type === 'repo-symlink') continue; // already linked to repo and unmodified
      if (!uniqueMap.has(item.skillId) || item.type === 'physical-dir') {
        uniqueMap.set(item.skillId, item);
      }
    }
    skillsToProcess = Array.from(uniqueMap.values());
    if (skillsToProcess.length === 0) {
      console.log(`${ANSI.yellow}No unmanaged or external skills found across agents to push.${ANSI.reset}\n`);
      return;
    }
  } else if (requestedSkillId) {
    const matches = await findSkill(requestedSkillId, sourceAgentOrPath, PACKAGE_ROOT);
    if (matches.length === 0) {
      console.error(`${ANSI.red}Error:${ANSI.reset} Skill "${requestedSkillId}" was not found${sourceAgentOrPath ? ` in ${sourceAgentOrPath}` : ' across any agent directories'}.`);
      console.error(`${ANSI.gray}Tip: Specify --from=<agent|path> or use "skills-directory push" to see all available skills.${ANSI.reset}\n`);
      process.exit(1);
    }

    if (matches.length === 1) {
      skillsToProcess = [matches[0]];
    } else {
      // Multiple locations found
      if (skipConfirm || !process.stdin.isTTY) {
        // Pick physical directory first, or first item
        const best = matches.find(m => m.type === 'physical-dir') || matches[0];
        skillsToProcess = [best];
      } else {
        console.log(`Skill "${requestedSkillId}" was found in multiple locations:`);
        const choices = matches.map((m, idx) => ({
          id: String(idx),
          label: `${m.agentName} (${m.type})`,
          hint: m.skillPath,
          selected: idx === 0
        }));
        const selectedIdx = await multiSelect('Choose which source to backup & push', choices);
        if (selectedIdx.length === 0) {
          console.log(`${ANSI.yellow}No source selected. Aborting.${ANSI.reset}`);
          return;
        }
        skillsToProcess = selectedIdx.map(i => matches[parseInt(i, 10)]);
      }
    }
  } else {
    // Interactive multi-selection across agents and store
    console.log(`${ANSI.gray}Scanning local agents for available skills...${ANSI.reset}`);
    const allDiscovered = await discoverAgentSkills(PACKAGE_ROOT);

    if (allDiscovered.length === 0) {
      console.log(`${ANSI.yellow}No skills found in any local agent directories.${ANSI.reset}\n`);
      return;
    }

    const items = allDiscovered.map(s => {
      let badge = '';
      if (s.type === 'physical-dir') badge = `${ANSI.magenta}[local folder]${ANSI.reset} `;
      else if (s.type === 'external-symlink') badge = `${ANSI.yellow}[external link]${ANSI.reset} `;
      else if (s.type === 'repo-symlink') badge = `${ANSI.gray}[repo link]${ANSI.reset} `;
      else if (s.type === 'repo') badge = `${ANSI.cyan}[repo]${ANSI.reset} `;

      return {
        id: `${s.agentId}::${s.skillId}`,
        label: `${s.skillId} ${badge}(${s.agentName})`,
        hint: s.description ? s.description.slice(0, 60) : s.skillPath,
        selected: s.type === 'physical-dir',
        skillData: s
      };
    });

    const selectedIds = await multiSelect('Select skill(s) to backup and push to repo', items);
    if (selectedIds.length === 0) {
      console.log(`${ANSI.yellow}No skills selected. Exiting.${ANSI.reset}\n`);
      return;
    }

    skillsToProcess = items.filter(it => selectedIds.includes(it.id)).map(it => it.skillData);
  }

  // Display summary before confirmation
  console.log(`\n${ANSI.bold}Selected skills to backup & push (${skillsToProcess.length}):${ANSI.reset}`);
  console.log(`${ANSI.gray}────────────────────────────────────────────────────────────────────────${ANSI.reset}`);
  for (const s of skillsToProcess) {
    console.log(`  ${ANSI.bold}${ANSI.green}• ${s.skillId}${ANSI.reset} from ${ANSI.cyan}${s.agentName}${ANSI.reset}`);
    console.log(`    ${ANSI.gray}Source:${ANSI.reset} ${ANSI.dim}${s.skillPath}${ANSI.reset}`);
    console.log(`    ${ANSI.gray}Target:${ANSI.reset} ${ANSI.dim}${path.join(PACKAGE_ROOT, 'skills', s.skillId)}${ANSI.reset}`);
  }
  console.log(`${ANSI.gray}────────────────────────────────────────────────────────────────────────${ANSI.reset}`);
  console.log(`${ANSI.bold}Options:${ANSI.reset} Git Push: ${noPush ? ANSI.yellow + 'Disabled (--no-push)' + ANSI.reset : ANSI.green + 'Enabled' + ANSI.reset} | Agent Symlink: ${noSymlink ? ANSI.yellow + 'Disabled (--no-symlink)' + ANSI.reset : ANSI.green + 'Enabled' + ANSI.reset}\n`);

  if (!skipConfirm && !dryRun) {
    const proceed = await confirm('Proceed with backup, repo import, and git push?', true);
    if (!proceed) {
      console.log(`\n${ANSI.yellow}Operation cancelled by user.${ANSI.reset}\n`);
      return;
    }
  }

  console.log(`\n${ANSI.bold}Executing backup & push operations...${ANSI.reset}\n`);

  for (const skill of skillsToProcess) {
    console.log(`${ANSI.bold}${ANSI.cyan}▶ Processing ${skill.skillId} (from ${skill.agentName}):${ANSI.reset}`);

    try {
      const result = await backupAndPushSkill(skill, {
        from: sourceAgentOrPath,
        repoRoot: PACKAGE_ROOT,
        dryRun,
        noPush,
        noSymlink,
        message: customMessage
      });

      // 1. Backup status
      if (result.backupRes.status === 'backed-up') {
        console.log(`  ${ANSI.magenta}📦 Backed up:${ANSI.reset} ${result.backupRes.backupDir}`);
      } else if (result.backupRes.status === 'dry-run') {
        console.log(`  ${ANSI.magenta}📦 [DRY RUN] Would backup to:${ANSI.reset} ${result.backupRes.backupDir}`);
      }

      // 2. Import status
      if (result.importRes.status === 'imported') {
        console.log(`  ${ANSI.green}✓ Imported to repo:${ANSI.reset} ${result.importRes.targetDir}`);
      } else if (result.importRes.status === 'same-path') {
        console.log(`  ${ANSI.gray}• Repo content already up to date${ANSI.reset}`);
      } else if (result.importRes.status === 'dry-run') {
        console.log(`  ${ANSI.green}✓ [DRY RUN] Would copy to:${ANSI.reset} ${result.importRes.targetDir}`);
      }

      // 3. Relink status
      if (result.relinkRes.status === 'relinked') {
        console.log(`  ${ANSI.green}🔗 Relinked agent:${ANSI.reset} ${result.relinkRes.linkPath} -> ${ANSI.dim}${result.relinkRes.target}${ANSI.reset}`);
      } else if (result.relinkRes.status === 'dry-run') {
        console.log(`  ${ANSI.green}🔗 [DRY RUN] Would relink:${ANSI.reset} ${result.relinkRes.linkPath} -> ${ANSI.dim}${result.relinkRes.target}${ANSI.reset}`);
      }

      // 4. Git status
      const git = result.gitRes;
      if (git.status === 'pushed') {
        console.log(`  ${ANSI.green}✓ Committed:${ANSI.reset} "${git.commitMessage}" (${git.commitHash || 'HEAD'})`);
        console.log(`  ${ANSI.bold}${ANSI.green}🚀 Successfully pushed to remote repository!${ANSI.reset}`);
      } else if (git.status === 'committed') {
        console.log(`  ${ANSI.green}✓ Committed locally:${ANSI.reset} "${git.commitMessage}" (${git.commitHash || 'HEAD'})`);
        console.log(`  ${ANSI.gray}• Skipped push (--no-push)${ANSI.reset}`);
      } else if (git.status === 'up-to-date') {
        console.log(`  ${ANSI.gray}• Git working tree already clean & up to date${ANSI.reset}`);
      } else if (git.status === 'push-failed') {
        console.log(`  ${ANSI.green}✓ Committed locally:${ANSI.reset} "${git.commitMessage}" (${git.commitHash || 'HEAD'})`);
        console.log(`  ${ANSI.yellow}⚠️  Git push encountered an issue:${ANSI.reset} ${git.error}`);
        console.log(`  ${ANSI.gray}👉 You can push manually using: git push${ANSI.reset}`);
      } else if (git.status === 'dry-run') {
        console.log(`  ${ANSI.green}✓ [DRY RUN] Would stage & commit:${ANSI.reset} "${git.commitMessage}"`);
        if (git.pushed) {
          console.log(`  ${ANSI.green}🚀 [DRY RUN] Would git push to remote repository${ANSI.reset}`);
        }
      } else if (git.status === 'commit-failed') {
        console.log(`  ${ANSI.red}✗ Git commit failed:${ANSI.reset} ${git.error}`);
      }
    } catch (err) {
      console.error(`  ${ANSI.red}✗ Error processing ${skill.skillId}:${ANSI.reset} ${err.message}`);
    }

    console.log();
  }

  console.log(`${ANSI.green}${ANSI.bold}Backup and push workflow completed!${ANSI.reset}\n`);
}

async function handleBackupAccountCommand({ positionals, values, dryRun, skipConfirm }) {
  console.log(`\n${ANSI.bold}${ANSI.cyan}☁️  Skills Directory: Claude Account Skills Backup & Sync${ANSI.reset}\n`);

  if (dryRun) {
    console.log(`${ANSI.yellow}${ANSI.bold}[DRY RUN MODE]${ANSI.reset} Simulating operations. No filesystem or git modifications.\n`);
  }

  const requestedSkillId = positionals[1] || values.skill || (values.skills && !values.skills.includes(',') ? values.skills : null);
  const customMessage = values.message || values.m || null;
  const noPush = Boolean(values['no-push']);
  const noSymlink = Boolean(values['no-symlink']);

  let targetAgents = ['claude', 'agy'];
  if (values.agents) {
    if (values.agents.toLowerCase() === 'all') {
      targetAgents = Object.keys(AGENTS);
    } else {
      targetAgents = values.agents.split(',').map(s => s.trim().toLowerCase());
    }
  }

  console.log(`${ANSI.gray}Scanning Claude account skills in ~/.claude/skills/synced/...${ANSI.reset}`);
  const discovered = await discoverClaudeAccountSkills({
    repoRoot: PACKAGE_ROOT,
    skillId: requestedSkillId
  });

  if (discovered.length === 0) {
    console.log(`${ANSI.yellow}No matching Claude account skills found in ~/.claude/skills/synced/.${ANSI.reset}\n`);
    return;
  }

  console.log(`Found ${ANSI.bold}${discovered.length}${ANSI.reset} Claude account skill(s):\n`);
  for (const s of discovered) {
    const statusTag = s.inRepo
      ? `${ANSI.yellow}[already central]${ANSI.reset}`
      : `${ANSI.green}[new to import]${ANSI.reset}`;
    console.log(`  • ${ANSI.bold}${s.skillId}${ANSI.reset} ${statusTag} ${ANSI.gray}- ${s.description.slice(0, 70)}${ANSI.reset}`);
  }
  console.log();

  if (!skipConfirm && !dryRun) {
    const proceed = await confirm(`Proceed with importing and linking ${discovered.length} Claude account skill(s)?`, true);
    if (!proceed) {
      console.log(`\n${ANSI.yellow}Operation cancelled by user.${ANSI.reset}\n`);
      return;
    }
    console.log();
  }

  const repoSkillsDir = path.join(PACKAGE_ROOT, 'skills');

  for (const skill of discovered) {
    console.log(`${ANSI.bold}${ANSI.cyan}▶ Processing ${skill.skillId}:${ANSI.reset}`);

    // 1. Import
    const importRes = await importClaudeAccountSkill(skill, PACKAGE_ROOT, { dryRun });
    if (importRes.status === 'skipped') {
      console.log(`  ${ANSI.gray}• skipped ${skill.skillId} (already central)${ANSI.reset}`);
    } else if (importRes.status === 'imported') {
      if (importRes.dryRun) {
        console.log(`  ${ANSI.green}✓ [DRY RUN] Would import ${skill.skillId} -> ${importRes.targetDir}${ANSI.reset}`);
      } else {
        console.log(`  ${ANSI.green}✓ imported ${skill.skillId}${ANSI.reset}`);
      }
    }

    // 2. Link
    if (!noSymlink) {
      const canonicalSkillPath = path.join(repoSkillsDir, skill.skillId);
      const linkResults = await linkClaudeAccountSkill(skill.skillId, canonicalSkillPath, targetAgents, { dryRun });
      for (const res of linkResults) {
        if (res.hasClash && res.agentKey === 'claude') {
          console.log(`  ${ANSI.yellow}⚠️  "${skill.skillId}" also exists as a Claude account skill; delete it from the claude.ai account so only the central copy is used.${ANSI.reset}`);
        }
        if (res.status === 'linked') {
          console.log(`  ${ANSI.green}✓ Linked in ${res.agentName}:${ANSI.reset} ${res.destPath} -> ${ANSI.dim}${res.target}${ANSI.reset}`);
        } else if (res.status === 'already-linked') {
          console.log(`  ${ANSI.gray}• Already linked in ${res.agentName}:${ANSI.reset} ${skill.skillId}`);
        } else if (res.status === 'updated-link') {
          console.log(`  ${ANSI.green}↻ Updated link in ${res.agentName}:${ANSI.reset} ${skill.skillId} -> ${ANSI.dim}${res.target}${ANSI.reset}`);
        } else if (res.status === 'replaced-dir') {
          console.log(`  ${ANSI.magenta}📦 Backed up directory:${ANSI.reset} ${res.backupPath}`);
          console.log(`  ${ANSI.green}✓ Linked in ${res.agentName}:${ANSI.reset} ${skill.skillId} -> ${ANSI.dim}${res.target}${ANSI.reset}`);
        }
      }
    }

    // 3. Git commit & push
    if (importRes.status === 'imported') {
      const commitMsg = customMessage || `import ${skill.skillId} from claude account`;
      const gitRes = await commitAndPushSkill(skill.skillId, PACKAGE_ROOT, {
        message: commitMsg,
        noPush,
        dryRun,
        agentName: 'claude account'
      });

      if (gitRes.status === 'pushed') {
        console.log(`  ${ANSI.green}✓ Committed:${ANSI.reset} "${gitRes.commitMessage}" (${gitRes.commitHash || 'HEAD'})`);
        console.log(`  ${ANSI.bold}${ANSI.green}🚀 Successfully pushed to remote repository!${ANSI.reset}`);
      } else if (gitRes.status === 'committed') {
        console.log(`  ${ANSI.green}✓ Committed locally:${ANSI.reset} "${gitRes.commitMessage}" (${gitRes.commitHash || 'HEAD'})`);
        console.log(`  ${ANSI.gray}• Skipped push (--no-push)${ANSI.reset}`);
      } else if (gitRes.status === 'dry-run') {
        console.log(`  ${ANSI.green}✓ [DRY RUN] Would stage & commit:${ANSI.reset} "${gitRes.commitMessage}"`);
        if (gitRes.pushed) {
          console.log(`  ${ANSI.green}🚀 [DRY RUN] Would git push to remote repository${ANSI.reset}`);
        }
      } else if (gitRes.status === 'push-failed') {
        console.log(`  ${ANSI.green}✓ Committed locally:${ANSI.reset} "${gitRes.commitMessage}"`);
        console.log(`  ${ANSI.yellow}⚠️  Git push failed:${ANSI.reset} ${gitRes.error}`);
      }
    }

    console.log();
  }

  console.log(`${ANSI.green}${ANSI.bold}Claude account skills sync completed!${ANSI.reset}\n`);
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      list: { type: 'boolean', short: 'l' },
      status: { type: 'boolean', short: 's' },
      'dry-run': { type: 'boolean', short: 'd' },
      unlink: { type: 'boolean', short: 'u' },
      yes: { type: 'boolean', short: 'y' },
      push: { type: 'boolean', short: 'p' },
      backup: { type: 'boolean', short: 'b' },
      account: { type: 'boolean' },
      'no-push': { type: 'boolean' },
      'no-symlink': { type: 'boolean' },
      all: { type: 'boolean', short: 'a' },
      from: { type: 'string', short: 'f' },
      skill: { type: 'string' },
      skills: { type: 'string' },
      agents: { type: 'string' },
      store: { type: 'string' },
      message: { type: 'string', short: 'm' }
    },
    allowPositionals: true,
    strict: false
  });

  if (values.help) {
    printHelp();
    return;
  }

  if (values.version) {
    const v = await getPackageVersion();
    console.log(`skills-directory v${v}`);
    return;
  }

  const dryRun = Boolean(values['dry-run']);
  const skipConfirm = Boolean(values.yes);

  // Check for positional command shortcuts
  const command = positionals[0] ? positionals[0].toLowerCase() : null;

  if (
    command === 'backup-account' ||
    command === 'sync-account' ||
    command === 'import-account' ||
    values.account ||
    (values.from && (values.from.toLowerCase() === 'claude-account' || values.from.toLowerCase() === 'account'))
  ) {
    await handleBackupAccountCommand({ positionals, values, dryRun, skipConfirm });
    return;
  }

  if (command === 'push' || command === 'backup' || values.push || values.backup) {
    await handlePushCommand({ positionals, values, dryRun, skipConfirm });
    return;
  }

  if (command === 'status') {
    values.status = true;
  } else if (command === 'list') {
    values.list = true;
  } else if (command === 'unlink') {
    values.unlink = true;
  } else if (command === 'sync') {
    values.skills = 'all';
    values.agents = 'all';
  }

  const skillsDir = path.join(PACKAGE_ROOT, 'skills');
  const availableSkills = await scanSkills(skillsDir);

  if (values.list) {
    console.log(`\n${ANSI.bold}${ANSI.cyan}Available Canonical Skills (${availableSkills.length}):${ANSI.reset}\n`);
    for (const skill of availableSkills) {
      console.log(`  ${ANSI.bold}${ANSI.green}• ${skill.id}${ANSI.reset}`);
      const desc = skill.description.replace(/\n/g, ' ').slice(0, 120);
      console.log(`    ${ANSI.gray}${desc}${desc.length >= 120 ? '...' : ''}${ANSI.reset}`);
      if (skill.argumentHint) {
        console.log(`    ${ANSI.yellow}Hint:${ANSI.reset} ${ANSI.gray}${skill.argumentHint}${ANSI.reset}`);
      }
    }
    console.log();
    return;
  }

  if (values.status) {
    console.log(`\n${ANSI.bold}${ANSI.cyan}Agent Skills Status Audit:${ANSI.reset}\n`);
    const statusReport = inspectAgentSkills(availableSkills);
    for (const [key, report] of Object.entries(statusReport)) {
      console.log(`${ANSI.bold}${report.name}${ANSI.reset} (${ANSI.dim}${report.path}${ANSI.reset}):`);
      if (!report.exists) {
        console.log(`  ${ANSI.yellow}Directory does not exist yet${ANSI.reset}\n`);
        continue;
      }
      for (const [skillId, info] of Object.entries(report.skills)) {
        if (info.type === 'symlink') {
          console.log(`  ${ANSI.green}✓ ${skillId}${ANSI.reset} -> ${ANSI.dim}${info.target}${ANSI.reset}`);
        } else if (info.type === 'physical-dir') {
          console.log(`  ${ANSI.yellow}📁 ${skillId}${ANSI.reset} ${ANSI.gray}(physical directory, not symlinked)${ANSI.reset}`);
        } else if (info.type === 'broken-symlink') {
          console.log(`  ${ANSI.red}✗ ${skillId}${ANSI.reset} ${ANSI.red}(broken link -> ${info.target})${ANSI.reset}`);
        } else if (info.type === 'protected') {
          console.log(`  ${ANSI.gray}🔒 ${skillId} (system protected)${ANSI.reset}`);
        }
      }
      console.log();
    }
    return;
  }

  // Determine target skills
  let selectedSkillIds = [];
  if (values.skills) {
    if (values.skills.toLowerCase() === 'all') {
      selectedSkillIds = availableSkills.map(s => s.id);
    } else {
      const requested = values.skills.split(',').map(s => s.trim().toLowerCase());
      selectedSkillIds = availableSkills.filter(s => requested.includes(s.id.toLowerCase())).map(s => s.id);
      if (selectedSkillIds.length === 0) {
        console.error(`${ANSI.red}Error:${ANSI.reset} No valid skills found matching "${values.skills}". Run --list to see available skills.`);
        process.exit(1);
      }
    }
  }

  // Determine target agents
  let selectedAgentKeys = [];
  if (values.agents) {
    if (values.agents.toLowerCase() === 'all') {
      selectedAgentKeys = Object.keys(AGENTS);
    } else {
      const requested = values.agents.split(',').map(s => s.trim().toLowerCase());
      selectedAgentKeys = Object.keys(AGENTS).filter(k => requested.includes(k));
      if (selectedAgentKeys.length === 0) {
        console.error(`${ANSI.red}Error:${ANSI.reset} No valid agents found matching "${values.agents}". Choose from: claude, agy, codex, all.`);
        process.exit(1);
      }
    }
  }

  // If interactive mode needed (no skills or agents specified via CLI flags)
  if (selectedSkillIds.length === 0 || selectedAgentKeys.length === 0) {
    console.log(`\n${ANSI.bold}${ANSI.cyan}⚡ Skills Directory Setup${ANSI.reset}\n`);

    if (selectedSkillIds.length === 0) {
      const skillItems = availableSkills.map(s => ({
        id: s.id,
        label: s.id,
        hint: s.description.slice(0, 60) + '...',
        selected: false
      }));
      selectedSkillIds = await multiSelect('Select skills to install', skillItems);
      if (selectedSkillIds.length === 0) {
        console.log(`${ANSI.yellow}No skills selected. Exiting.${ANSI.reset}`);
        return;
      }
    }

    if (selectedAgentKeys.length === 0) {
      const agentItems = Object.entries(AGENTS).map(([k, v]) => ({
        id: k,
        label: `${v.name}`,
        hint: v.path,
        selected: false
      }));
      selectedAgentKeys = await multiSelect('Select coding agents to symlink into', agentItems);
      if (selectedAgentKeys.length === 0) {
        console.log(`${ANSI.yellow}No agents selected. Exiting.${ANSI.reset}`);
        return;
      }
    }
  }

  const isUnlink = Boolean(values.unlink);

  if (dryRun) {
    console.log(`${ANSI.yellow}${ANSI.bold}[DRY RUN MODE]${ANSI.reset} No disk modifications will occur.\n`);
  }

  // Handle Unlink
  if (isUnlink) {
    console.log(`\n${ANSI.bold}${ANSI.red}Review skills to unlink:${ANSI.reset}`);
    for (const id of selectedSkillIds) {
      console.log(`  • ${ANSI.bold}${id}${ANSI.reset}`);
    }
    console.log(`Target agents: ${selectedAgentKeys.map(k => AGENTS[k].name).join(', ')}\n`);

    if (!skipConfirm && !dryRun) {
      const proceed = await confirm('Are you sure you want to unlink these skills?', false);
      if (!proceed) {
        console.log(`${ANSI.yellow}Unlink aborted by user.${ANSI.reset}`);
        return;
      }
    }

    console.log(`\n${ANSI.bold}Unlinking ${selectedSkillIds.length} skill(s) from ${selectedAgentKeys.length} agent(s)...${ANSI.reset}\n`);
    for (const agentKey of selectedAgentKeys) {
      for (const skillId of selectedSkillIds) {
        const result = await unlinkSkill(skillId, agentKey, { dryRun });
        if (result.status === 'unlinked') {
          console.log(`  ${ANSI.green}✓ Unlinked:${ANSI.reset} ${skillId} from ${AGENTS[agentKey].name}`);
        } else if (result.status === 'not-found') {
          console.log(`  ${ANSI.gray}• Not linked:${ANSI.reset} ${skillId} on ${AGENTS[agentKey].name}`);
        } else if (result.status === 'skipped') {
          console.log(`  ${ANSI.yellow}⚠ Skipped:${ANSI.reset} ${skillId} on ${AGENTS[agentKey].name} (${result.reason})`);
        }
      }
    }
    console.log(`\n${ANSI.green}Done.${ANSI.reset}`);
    return;
  }

  // Handle Link: Determine canonical store
  const preferPersistent = values.store === 'persist';
  const canonicalSource = await getCanonicalSource(PACKAGE_ROOT, preferPersistent);

  // DISPLAY SKILL DETAILS & SUMMARY BEFORE SETTING UP
  console.log(`\n${ANSI.bold}${ANSI.cyan}📦 Planned Skills Installation Summary:${ANSI.reset}`);
  console.log(`${ANSI.gray}────────────────────────────────────────────────────────────────────────${ANSI.reset}`);
  
  const selectedSkillsData = availableSkills.filter(s => selectedSkillIds.includes(s.id));
  for (const skill of selectedSkillsData) {
    console.log(`  ${ANSI.bold}${ANSI.green}• ${skill.id}${ANSI.reset}`);
    const cleanDesc = skill.description.replace(/\n+/g, ' ').trim();
    console.log(`    ${ANSI.gray}${cleanDesc}${ANSI.reset}`);
    if (skill.argumentHint) {
      console.log(`    ${ANSI.yellow}Hint:${ANSI.reset} ${ANSI.gray}${skill.argumentHint}${ANSI.reset}`);
    }
  }

  console.log(`${ANSI.gray}────────────────────────────────────────────────────────────────────────${ANSI.reset}`);
  console.log(`${ANSI.bold}Target Coding Agents (${selectedAgentKeys.length}):${ANSI.reset}`);
  for (const agentKey of selectedAgentKeys) {
    const agent = AGENTS[agentKey];
    console.log(`  • ${ANSI.cyan}${agent.name}${ANSI.reset} (${ANSI.dim}${agent.path}${ANSI.reset})`);
  }
  console.log(`${ANSI.bold}Source Mode:${ANSI.reset} ${canonicalSource.type === 'repo' ? 'Direct Git Repo' : 'Persistent Store (~/.agents/skills)'}`);
  console.log(`${ANSI.bold}Source Path:${ANSI.reset} ${ANSI.dim}${canonicalSource.baseDir}${ANSI.reset}`);

  // Check for any existing skill conflicts across target agents
  const conflicts = [];
  for (const agentKey of selectedAgentKeys) {
    for (const skillId of selectedSkillIds) {
      const skillPath = path.join(canonicalSource.baseDir, skillId);
      const conf = await checkSkillConflict(skillId, skillPath, agentKey);
      if (conf.hasConflict) {
        conflicts.push({ agentKey, skillId, conf });
      }
    }
  }

  if (conflicts.length > 0) {
    console.log(`\n${ANSI.yellow}${ANSI.bold}⚠️  Existing Skill Conflicts Detected (${conflicts.length}):${ANSI.reset}`);
    for (const c of conflicts) {
      const typeStr = c.conf.type === 'directory'
        ? 'local folder'
        : c.conf.type === 'symlink'
          ? `existing symlink -> ${c.conf.currentTarget}`
          : 'file';
      console.log(`  • ${ANSI.bold}${c.skillId}${ANSI.reset} in ${AGENTS[c.agentKey].name} (${ANSI.dim}${typeStr}${ANSI.reset})`);
    }
    console.log(`  ${ANSI.dim}Existing folders will be safely backed up to ~/.agents/backups/<agent>/ if replaced.${ANSI.reset}`);
  }
  console.log(`${ANSI.gray}────────────────────────────────────────────────────────────────────────${ANSI.reset}\n`);

  // USER CONFIRMATION STEP
  if (!skipConfirm && !dryRun) {
    const proceed = await confirm('Proceed with setting up and symlinking these skills?', true);
    if (!proceed) {
      console.log(`\n${ANSI.yellow}Setup cancelled by user. No changes were made.${ANSI.reset}\n`);
      return;
    }
    console.log();
  }

  // If using persistent store mode, ensure canonical skills are synced to ~/.agents/skills
  if (canonicalSource.type === 'persistent') {
    for (const skillId of selectedSkillIds) {
      const src = path.join(skillsDir, skillId);
      const dest = path.join(canonicalSource.baseDir, skillId);
      if (!dryRun) {
        await copySkillToStore(src, dest);
      }
    }
  }

  // Perform linking
  console.log(`${ANSI.bold}Linking ${selectedSkillIds.length} skill(s) into ${selectedAgentKeys.length} agent(s):${ANSI.reset}\n`);

  for (const agentKey of selectedAgentKeys) {
    const agent = AGENTS[agentKey];
    console.log(`${ANSI.bold}${ANSI.cyan}▶ ${agent.name}${ANSI.reset} (${ANSI.dim}${agent.path}${ANSI.reset}):`);

    for (const skillId of selectedSkillIds) {
      const skillPath = path.join(canonicalSource.baseDir, skillId);
      const conflict = await checkSkillConflict(skillId, skillPath, agentKey);

      let replace = true;
      if (conflict.hasConflict) {
        const typeStr = conflict.type === 'directory' ? 'folder' : 'symlink';
        if (!skipConfirm && !dryRun) {
          replace = await confirm(`Skill "${skillId}" already exists in ${agent.name} (${typeStr}). Replace and backup?`, false);
        }
      }

      if (!replace) {
        console.log(`  ${ANSI.yellow}• Kept existing:${ANSI.reset} ${skillId} (replacement declined)`);
        continue;
      }

      const result = await linkSkill(skillId, skillPath, agentKey, { dryRun, replace: true });

      if (result.status === 'linked') {
        console.log(`  ${ANSI.green}✓ Linked:${ANSI.reset} ${skillId} -> ${ANSI.dim}${result.target}${ANSI.reset}`);
      } else if (result.status === 'already-linked') {
        console.log(`  ${ANSI.gray}• Already linked:${ANSI.reset} ${skillId}`);
      } else if (result.status === 'updated-link') {
        console.log(`  ${ANSI.green}↻ Updated link:${ANSI.reset} ${skillId} -> ${ANSI.dim}${result.target}${ANSI.reset}`);
      } else if (result.status === 'replaced-dir') {
        console.log(`  ${ANSI.magenta}📦 Backed up directory:${ANSI.reset} ${result.backupPath}`);
        console.log(`  ${ANSI.green}✓ Linked:${ANSI.reset} ${skillId} -> ${ANSI.dim}${result.target}${ANSI.reset}`);
      } else if (result.status === 'skipped') {
        console.log(`  ${ANSI.yellow}⚠ Skipped:${ANSI.reset} ${skillId} (${result.reason})`);
      }
    }
    console.log();
  }

  console.log(`${ANSI.green}${ANSI.bold}All selected skills successfully configured!${ANSI.reset}\n`);
}

main().catch(err => {
  console.error(`\n${ANSI.red}${ANSI.bold}Execution error:${ANSI.reset}`, err);
  process.exit(1);
});
