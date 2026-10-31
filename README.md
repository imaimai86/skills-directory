# @imaimai86/skills-directory

> Multi-agent skill directory and cross-runtime symlink manager for **Claude Code**, **Antigravity (AGY)**, and **Codex**.

Manage and synchronize your AI agent skills from a single canonical repository, with zero duplicated prompt files and automatic symlinking across all your local agent runtimes.

---

## Features

- **Single Source of Truth**: All skills live in one place (`skills/`). Updates or git pulls immediately reflect across Claude, Antigravity, and Codex.
- **Interactive Multi-Select CLI**: Choose which skills to install and which coding agents to link into with a clean terminal TUI.
- **Headless & Scriptable**: First-class CLI flags (`--skills`, `--agents`, `--status`, `--unlink`, `--dry-run`) for automated setups and dotfile management.
- **Persistent Cache Safeguard**: Automatically prevents broken symlinks when run via ephemeral `npx` caches by maintaining a stable user store at `~/.agents/skills/`.
- **Protected Namespaces**: Respects tool-internal directories (safeguards `~/.claude/skills/synced/` and `~/.codex/skills/.system/`).
- **Zero Runtime Dependencies**: Ultra-lightweight native Node.js ESM.

---

## Quick Start

### 1. Interactive Setup via `npx`
Run without arguments to launch the interactive terminal selector:

```bash
npx @imaimai86/skills-directory
```

Use <kbd>Space</kbd> to toggle, <kbd>a</kbd> to toggle all, and <kbd>Enter</kbd> to confirm skills and target agents.

---

### 2. Headless / Scripted Usage

Install all skills across all agents:
```bash
npx @imaimai86/skills-directory --skills=all --agents=all
```

Install specific skills to selected agents:
```bash
npx @imaimai86/skills-directory --skills=deepen,grill-me,write-a-prd --agents=claude,agy
```

Check current symlink health across all agent directories:
```bash
npx @imaimai86/skills-directory --status
```

Preview actions without touching the filesystem:
```bash
npx @imaimai86/skills-directory --skills=deepen --agents=claude --dry-run
```

Unlink a skill:
```bash
npx @imaimai86/skills-directory --unlink --skills=deepen --agents=claude
```

List available canonical skills:
```bash
npx @imaimai86/skills-directory --list
```

---

## Supported Coding Agents

| Agent | Discovery Path | Description |
| :--- | :--- | :--- |
| **Claude Code** | `~/.claude/skills/` | Anthropic's Claude Code CLI |
| **Antigravity (AGY)** | `~/.gemini/config/skills/` | Google Antigravity / AGY CLI |
| **Codex** | `~/.codex/skills/` | Codex CLI |

---

## Included Skills

| Skill | Description |
| :--- | :--- |
| `career-ops` | AI job search agent: CV generation, portal scanning, application tracking, interview prep. |
| `context7-mcp` | Framework, library, and API documentation assistant. |
| `deepen` | Turns goals into professional-grade tasks with rigorous acceptance criteria and multi-model review. |
| `find-skills` | Discovers and installs capabilities when exploring new workflows. |
| `graft` | Indexes and navigates repositories via graft architecture context. |
| `grill-me` | Relentless design and plan stress-tester resolving decision trees interactively. |
| `hf-cli` | Hugging Face Hub CLI manager for models, datasets, and infrastructure. |
| `indeed-job-application` | End-to-end Indeed job applications via browser automation. |
| `linkedin-find-contacts` | Discovers hiring managers, recruiters, and alumni for job hunt outreach. |
| `linkedin-job-apply` | End-to-end LinkedIn Easy Apply workflow assistant. |
| `linkedin-send-connections` | Automated staged LinkedIn outreach and connection requests. |
| `write-a-prd` | Interactive PRD interview, codebase architecture design, and issue generation. |

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
   The CLI dynamically indexes all skills in `skills/` with zero configuration needed.

---

## License

MIT © [imaimai86](https://github.com/imaimai86)
