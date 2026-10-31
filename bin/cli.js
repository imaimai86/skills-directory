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
  linkSkill,
  unlinkSkill,
  inspectAgentSkills
} from '../lib/linker.js';
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
${ANSI.bold}${ANSI.cyan}skills-directory${ANSI.reset} - Multi-agent skill manager for Claude Code, Antigravity, and Codex

${ANSI.bold}USAGE:${ANSI.reset}
  npx @imaimai86/skills-directory [OPTIONS]
  skills-directory [OPTIONS]

${ANSI.bold}OPTIONS:${ANSI.reset}
  -l, --list                  List all available canonical skills with descriptions
  -s, --status                Show current installation/symlink status across all agents
  -d, --dry-run               Simulate actions without making filesystem modifications
  -u, --unlink                Unlink selected skills from selected agent paths
  -y, --yes                   Skip confirmation prompt and proceed immediately
      --skills=<list|all>     Comma-separated list of skill IDs (or 'all')
      --agents=<list|all>     Target agent runtimes: claude, agy, codex (or 'all')
      --store=<repo|persist>  Force source store: 'repo' (direct symlink) or 'persist' (~/.agents/skills)
  -h, --help                  Display this help message
  -v, --version               Display version information

${ANSI.bold}EXAMPLES:${ANSI.reset}
  ${ANSI.gray}# Interactive selection with confirmation:${ANSI.reset}
  npx @imaimai86/skills-directory

  ${ANSI.gray}# Link all skills to Claude Code and Antigravity:${ANSI.reset}
  npx @imaimai86/skills-directory --skills=all --agents=claude,agy

  ${ANSI.gray}# Link specific skills without confirmation prompt:${ANSI.reset}
  npx @imaimai86/skills-directory --skills=deepen,grill-me --agents=all --yes

  ${ANSI.gray}# Check status of installed agent skills:${ANSI.reset}
  npx @imaimai86/skills-directory --status

  ${ANSI.gray}# Unlink a skill:${ANSI.reset}
  npx @imaimai86/skills-directory --unlink --skills=deepen --agents=claude
`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      list: { type: 'boolean', short: 'l' },
      status: { type: 'boolean', short: 's' },
      'dry-run': { type: 'boolean', short: 'd' },
      unlink: { type: 'boolean', short: 'u' },
      yes: { type: 'boolean', short: 'y' },
      skills: { type: 'string' },
      agents: { type: 'string' },
      store: { type: 'string' }
    },
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

  const dryRun = Boolean(values['dry-run']);
  const isUnlink = Boolean(values.unlink);
  const skipConfirm = Boolean(values.yes);

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
    // Wrap description cleanly
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
      const result = await linkSkill(skillId, skillPath, agentKey, { dryRun });

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
