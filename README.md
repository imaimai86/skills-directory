# @imaimai86/skills-directory

> Multi-agent skill directory and cross-runtime symlink manager for **Claude Code**, **Antigravity (AGY)**, and **Codex**.

Manage and synchronize your curated AI agent skills from a single canonical repository, with zero duplicated prompt files and automatic symlinking across all your local agent runtimes.

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
  - [Quick Run Options](#quick-run-options)
  - [Headless / Scripted Mode](#headless--scripted-mode)
- [Backup & Push Skills from Agents](#backup--push-skills-from-agents)
- [Supported Coding Agents](#supported-coding-agents)
- [Skills Catalog](#skills-catalog)
  - [deepen](#1-deepen)
  - [linkedin-find-contacts](#2-linkedin-find-contacts)
  - [linkedin-job-apply](#3-linkedin-job-apply)
  - [linkedin-send-connections](#4-linkedin-send-connections)
- [Local Development & Maintainer Workflow](#local-development--maintainer-workflow)
- [Architecture & Safety Guarantees](#architecture--safety-guarantees)
- [License](#license)

---

## Features

- **Single Source of Truth**: All skills live in one canonical place (`skills/`). Updates or git pulls immediately reflect across Claude, Antigravity, and Codex.
- **Two-Way Agent Push & Backup**: Effortlessly backup, adopt, and push skills created inside Claude Code, AGY, Codex, Cursor, Windsurf, or any custom agent folder directly into the repository and git remote.
- **Automated Safety Backups**: Every imported or replaced skill is safely archived with an ISO timestamp into `~/.agents/backups/<agent>/<skill>-<timestamp>/` before anything is modified.
- **Interactive Multi-Select with Previews**: Inspect skill details, descriptions, and target paths before confirming changes.
- **Headless & Scriptable**: First-class CLI flags (`push`, `backup`, `--from`, `--message`, `--skills`, `--agents`, `--status`, `--unlink`, `--dry-run`, `--yes`) for automated setups and dotfile management.
- **Persistent Cache Safeguard**: Automatically prevents broken symlinks when run via ephemeral `npx` caches by maintaining a stable user store at `~/.agents/skills/`.
- **Protected Namespaces**: Respects tool-internal directories (safeguards `~/.claude/skills/synced/` and `~/.codex/skills/.system/`).
- **Zero Runtime Dependencies**: Ultra-lightweight native Node.js ESM.

---

## Quick Start

### Quick Run Options

#### Option A: Direct Command (On This Machine)
Because the package is linked locally on your system:
```bash
skills-directory
# or with flags:
skills-directory --skills=all --agents=all --yes
```

#### Option B: Via GitHub Directly (Any Machine, Zero Setup)
Run directly from the GitHub repository without needing npm registry publication:
```bash
npx -y github:imaimai86/skills-directory
# or with flags:
npx -y github:imaimai86/skills-directory --skills=all --agents=all --yes
```

#### Option C: Via NPM Registry (Once Published)
To make `npx @imaimai86/skills-directory` work globally:
1. Log in: `npm login`
2. Publish: `npm publish --access public`
3. Run anywhere:
```bash
npx @imaimai86/skills-directory
```

---

### Headless / Scripted Mode

Install all skills across all agents:
```bash
skills-directory --skills=all --agents=all --yes
```

Install specific skills to selected agents:
```bash
skills-directory --skills=deepen,linkedin-job-apply --agents=claude,agy
```

Check current symlink health across all agent directories:
```bash
skills-directory --status
```

Preview actions without touching the filesystem:
```bash
skills-directory --skills=deepen --agents=claude --dry-run
```

Unlink a skill from an agent:
```bash
skills-directory --unlink --skills=deepen --agents=claude
```

List all available canonical skills:
```bash
skills-directory --list
```

---

## Backup & Push Skills from Agents

When you build or modify a skill inside a specific agent runtime (Claude Code, Antigravity, Codex, Cursor, Windsurf, or any custom folder), you can backup, import it into the canonical repository, relink it so the agent immediately tracks the repo version, and push it directly to Git.

### Commands & Aliases

Both `push` and `backup` can be used interchangeably:

```bash
skills-directory push [skill-name] [options]
skills-directory backup [skill-name] [options]
```

Or via `npm run`:
```bash
npm run push -- [skill-name] [options]
npm run backup -- [skill-name] [options]
```

### Examples

#### 1. Auto-Discovery Push
Auto-detects where the skill exists across all known local agents (Claude, AGY, Codex, etc.), creates a safety backup, copies it to `skills/`, relinks the agent to the repo, commits, and pushes to Git remote:
```bash
skills-directory push context7-mcp
```

#### 2. Push from a Specific Agent
Explicitly specify the source runtime using `--from` (or `-f`):
```bash
# From Claude Code (~/.claude/skills)
skills-directory push context7-mcp --from=claude

# From Antigravity / AGY (~/.gemini/config/skills)
skills-directory push grill-me --from=agy

# From Codex (~/.codex/skills)
skills-directory push my-tool --from=codex

# From Cursor (~/.cursor/skills) or Windsurf (~/.codeium/windsurf/skills)
skills-directory push agent-search --from=cursor
```

#### 3. Push from Any Custom Directory or Coding Agent
Support any agent runtime or arbitrary directory on your filesystem:
```bash
# Specify direct path
skills-directory push custom-skill --from=~/.my-agent/skills

# Direct path as argument
skills-directory push /Volumes/Work/Projects/my-skills/custom-skill

# Custom named agent format
skills-directory push custom-skill --from=opencode=/opt/opencode/skills
```

#### 4. Interactive Mode
Running `skills-directory push` without arguments interactively scans all installed agents, discovers unmanaged local folders, external symlinks, and repo skills, and lets you select which ones to process:
```bash
skills-directory push
```

#### 5. Custom Commit Message & Dry Run
Preview all actions before touching files or git:
```bash
skills-directory push context7-mcp -m "feat(skills): add context7 mcp prompt" --dry-run
```

#### 6. Local Import Only (Without Remote Push)
Backup, import into `skills/`, relink, and create a local Git commit without pushing upstream:
```bash
skills-directory push context7-mcp --no-push
```

#### 7. Keep Agent Source Intact (Without Relinking)
Backup, import to repo, and push without replacing the agent's original physical folder with a symlink:
```bash
skills-directory push context7-mcp --no-symlink
```

---

## Supported Coding Agents

| Agent | Discovery Path | Description |
| :--- | :--- | :--- |
| **Claude Code** | `~/.claude/skills/` | Anthropic's Claude Code CLI |
| **Antigravity (AGY)** | `~/.gemini/config/skills/` | Google Antigravity / AGY CLI |
| **Codex** | `~/.codex/skills/` | Codex CLI |
| **Cursor** | `~/.cursor/skills/` | Cursor IDE agent skills |
| **Windsurf** | `~/.codeium/windsurf/skills/` | Codeium Windsurf IDE agent skills |
| **Cline** | `~/.cline/skills/` | Cline VS Code extension skills |
| **Any Custom Agent** | `--from=<path>` or `--from=name=<path>` | Any directory on your machine |

---

## Skills Catalog

---

### 1. `deepen`

* **Purpose:** Elevates any incoming goal into a professional-grade task by adopting the perspective of an expert in that domain. It enforces raw primary sources, named methodologies, and external acceptance criteria, ending with an independent multi-model review.
* **When to Use:**
  * When starting complex projects requiring thorough design, rigor, and zero hand-waving.
  * Triggered via `/deepen [goal] [as <professional>]`, "deepen this", or "do this like a pro would".
* **Key Mechanism:**
  * Compares *Asked* vs. *Deeper*.
  * Departs from naive literal requirements to account for edge cases and real-world failure modes.
  * Produces a self-contained execution prompt and requires review by an independent model session before sign-off.

---

### 2. `linkedin-find-contacts`

* **Purpose:** Identifies target outreach contacts on LinkedIn for companies where jobs were applied.
* **When to Use:**
  * Finding the job poster, hiring managers, talent acquisition recruiters, and alumni from previous employers.
  * Structures findings into outreach tracker CSVs with draft notes and seniority rankings for targeted follow-ups.

---

### 3. `linkedin-job-apply`

* **Purpose:** Automates applying to LinkedIn Easy Apply job postings end-to-end.
* **When to Use:**
  * When passing a LinkedIn job URL (`linkedin.com/jobs/view/...`).
  * Parses role requirements, matches against CV profiles, fills complex multi-step Easy Apply modal forms, and pauses for explicit human confirmation before the final submit click.

---

### 4. `linkedin-send-connections`

* **Purpose:** Staged LinkedIn outreach dispatcher that sends personalized connection requests with rate-limiting.
* **When to Use:**
  * Executing approved connection batches from tracker CSVs.
  * Enforces randomized delays (10-20 minutes) between requests to respect LinkedIn account safety guidelines.

---

## Local Development & Maintainer Workflow

If you cloned this repository locally (e.g. `/Volumes/Work/Projects/claude-code/skills-directory`):

1. **Link your local skills directly from the repo:**
   ```bash
   npm run sync
   ```
   *(Running inside the local Git clone links target paths directly into the repo checkout, so any edit or pull updates all agents immediately).*

2. **Check symlink status:**
   ```bash
   npm run status
   ```

3. **Run unit tests:**
   ```bash
   npm test
   ```

4. **Adding a new skill:**
   Simply create a new directory inside `skills/<your-skill>/` with a `SKILL.md` containing standard YAML frontmatter:
   ```markdown
   ---
   name: your-skill
   description: What this skill does and when to invoke it.
   ---
   # Your Skill Content
   ```
   The CLI dynamically discovers and exposes all skills in `skills/` with zero configuration needed.

---

## Architecture & Safety Guarantees

```
┌────────────────────────────────────────────────────────┐
│                   skills-directory                     │
│               (Single Source of Truth)                 │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
      ~/.claude/skills ~/.gemini/skills ~/.codex/skills
       (Claude Code)   (Antigravity)       (Codex)
```

- **Conflict Detection & Confirmation**: If a skill with the same name already exists in an agent path (as a physical folder or differing symlink), the CLI detects it and asks for explicit confirmation: `Skill "<name>" already exists. Replace and backup? (y/N)`. Declining keeps the existing skill intact.
- **Dedicated External Backups**: When an existing skill folder is replaced, it is safely moved to a dedicated directory outside of all agent discovery paths (`~/.agents/backups/<agent>/<skill>-<timestamp>/`). Because it lives outside `skills/`, agents will never scan or load backup files as active skills.
- **No Broken NPM Caches**: When installed via `npx`, skills are persisted in `~/.agents/skills/` before linking so symlinks survive cache purges.

---

## License

MIT © [imaimai86](https://github.com/imaimai86)
