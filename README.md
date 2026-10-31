# @imaimai86/skills-directory

> Multi-agent skill directory and cross-runtime symlink manager for **Claude Code**, **Antigravity (AGY)**, and **Codex**.

Manage and synchronize your AI agent skills from a single canonical repository, with zero duplicated prompt files and automatic symlinking across all your local agent runtimes.

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
  - [Interactive Mode (with Preview & Confirmation)](#interactive-mode-with-preview--confirmation)
  - [Headless / Scripted Mode](#headless--scripted-mode)
- [Supported Coding Agents](#supported-coding-agents)
- [Skills Catalog (Detailed Sections)](#skills-catalog)
  - [career-ops](#1-career-ops)
  - [context7-mcp](#2-context7-mcp)
  - [deepen](#3-deepen)
  - [find-skills](#4-find-skills)
  - [graft](#5-graft)
  - [grill-me](#6-grill-me)
  - [hf-cli](#7-hf-cli)
  - [indeed-job-application](#8-indeed-job-application)
  - [linkedin-find-contacts](#9-linkedin-find-contacts)
  - [linkedin-job-apply](#10-linkedin-job-apply)
  - [linkedin-send-connections](#11-linkedin-send-connections)
  - [write-a-prd](#12-write-a-prd)
- [Local Development & Maintainer Workflow](#local-development--maintainer-workflow)
- [Architecture & Safety Guarantees](#architecture--safety-guarantees)
- [License](#license)

---

## Features

- **Single Source of Truth**: All skills live in one canonical place (`skills/`). Updates or git pulls immediately reflect across Claude, Antigravity, and Codex.
- **Interactive Multi-Select with Previews**: Inspect skill details, descriptions, and target paths before confirming changes.
- **Headless & Scriptable**: First-class CLI flags (`--skills`, `--agents`, `--status`, `--unlink`, `--dry-run`, `--yes`) for automated setups and dotfile management.
- **Persistent Cache Safeguard**: Automatically prevents broken symlinks when run via ephemeral `npx` caches by maintaining a stable user store at `~/.agents/skills/`.
- **Protected Namespaces**: Respects tool-internal directories (safeguards `~/.claude/skills/synced/` and `~/.codex/skills/.system/`).
- **Zero Runtime Dependencies**: Ultra-lightweight native Node.js ESM.

---

## Quick Start

### Interactive Mode (with Preview & Confirmation)
Run without arguments to launch the interactive terminal selector:

```bash
npx @imaimai86/skills-directory
```

1. **Select skills**: Use <kbd>Space</kbd> to toggle, <kbd>a</kbd> to toggle all, and <kbd>Enter</kbd> to confirm.
2. **Select agents**: Choose which coding agents (Claude, AGY, Codex) to symlink into.
3. **Review summary**: The CLI prints a summary card with full descriptions and target paths.
4. **Confirm**: Confirm with `y` to apply the symlinks.

---

### Headless / Scripted Mode

Install all skills across all agents:
```bash
npx @imaimai86/skills-directory --skills=all --agents=all --yes
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

Unlink a skill from an agent:
```bash
npx @imaimai86/skills-directory --unlink --skills=deepen --agents=claude
```

List all available canonical skills:
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

## Skills Catalog

Each skill in this repository is structured with standardized YAML frontmatter and comprehensive prompt instructions:

---

### 1. `career-ops`

* **Purpose:** An open-source, full-lifecycle AI job search agent. Handles CV evaluation and generation, job portal scanning, application tracking, interview preparation, and outreach drafting.
* **When to Use:**
  * When pasting a job URL or job description to evaluate fit.
  * When generating tailored CVs (text, PDF, or LaTeX) for specific roles.
  * When scanning job portals, tracking application pipelines, or running triage batches.
  * Preparing for technical interviews, debriefing interviews, or analyzing offer packages.
* **Supported Modes / Argument Hints:**
  ```bash
  /career-ops [scan | discover | deep | pdf | ats | text | latex | cover | email | add | apply | triage | batch | tracker | interview-prep | interview | retro | calibrate | offer-prep | update]
  ```

---

### 2. `context7-mcp`

* **Purpose:** Provides direct integration and contextual assistance for software libraries, frameworks, APIs, and modern toolchains.
* **When to Use:**
  * Whenever asking setup or implementation questions involving external libraries (e.g., React, Next.js, Prisma, Supabase, Tailwind, FastAPI).
  * Requesting verified code examples, architecture patterns, and API reference lookups.
  * Eliminates guesswork about library versions and API signatures.

---

### 3. `deepen`

* **Purpose:** Elevates any incoming goal into a professional-grade task by adopting the perspective of an expert in that domain. It enforces raw primary sources, named methodologies, and external acceptance criteria, ending with an independent multi-model review.
* **When to Use:**
  * When starting complex projects requiring thorough design, rigor, and zero hand-waving.
  * Triggered via `/deepen [goal] [as <professional>]`, "deepen this", or "do this like a pro would".
* **Key Mechanism:**
  * Compares *Asked* vs. *Deeper*.
  * Departs from naive literal requirements to account for edge cases and real-world failure modes.
  * Produces a self-contained execution prompt and requires review by an independent model session before sign-off.

---

### 4. `find-skills`

* **Purpose:** Discovers, searches, and installs agent skills from local configurations and online skill ecosystems.
* **When to Use:**
  * When asking questions like *"how do I do X"*, *"find a skill for X"*, or *"is there a skill that can..."*.
  * Enables agents to dynamically expand their own toolsets to accomplish unfamiliar or specialized tasks.

---

### 5. `graft`

* **Purpose:** Deep codebase indexing and navigation tool based on graft architecture. Provides comprehensive dependency maps, symbol traces, and call graphs.
* **When to Use:**
  * For understanding how complex codebases function before editing.
  * Tracing which functions call a symbol, what breaking changes an edit introduces, or finding where code lives before grepping or reading raw files.

---

### 6. `grill-me`

* **Purpose:** Relentless plan and architecture stress-testing. Interviews the user about their proposal to systematically resolve every branch of the decision tree.
* **When to Use:**
  * Before beginning non-trivial architectural changes, refactors, or feature additions.
  * Triggered by `/grill-me`, "grill me on this design", or "stress test my plan".
  * Refuses hand-waving, explores existing codebase state to answer factual questions, and forces key trade-offs into the open.

---

### 7. `hf-cli`

* **Purpose:** Comprehensive integration for Hugging Face Hub CLI (`hf`). Manages models, datasets, Spaces, repositories, papers, webhooks, and inference endpoints.
* **When to Use:**
  * Any AI/ML workflow touching the Hugging Face Hub.
  * Downloading/uploading model checkpoints, querying datasets, running Hugging Face cloud jobs, managing buckets, and deploying Inference Endpoints.
  * Replaces deprecated `huggingface-cli` syntax with modern `hf` command structures.

---

### 8. `indeed-job-application`

* **Purpose:** Automates applying to pending job leads on Indeed end-to-end via headless or visible browser automation.
* **When to Use:**
  * Processing leads from the job tracker.
  * Drives Indeed's "Apply with Indeed" flow, auto-populates screener questions against the user profile, pauses for explicit confirmation before final submission, and logs statuses.

---

### 9. `linkedin-find-contacts`

* **Purpose:** Identifies target outreach contacts on LinkedIn for companies where jobs were applied.
* **When to Use:**
  * Finding the job poster, hiring managers, talent acquisition recruiters, and alumni from previous employers.
  * Structures findings into outreach tracker CSVs with draft notes and seniority rankings for targeted follow-ups.

---

### 10. `linkedin-job-apply`

* **Purpose:** Automates applying to LinkedIn Easy Apply job postings end-to-end.
* **When to Use:**
  * When passing a LinkedIn job URL (`linkedin.com/jobs/view/...`).
  * Parses role requirements, matches against CV profiles, fills complex multi-step Easy Apply modal forms, and pauses for explicit human confirmation before the final submit click.

---

### 11. `linkedin-send-connections`

* **Purpose:** Staged LinkedIn outreach dispatcher that sends personalized connection requests with rate-limiting.
* **When to Use:**
  * Executing approved connection batches from tracker CSVs.
  * Enforces randomized delays (10-20 minutes) between requests to respect LinkedIn account safety guidelines.

---

### 12. `write-a-prd`

* **Purpose:** Generates comprehensive Product Requirement Documents (PRDs) through interactive requirements gathering, codebase exploration, and module architecture design.
* **When to Use:**
  * When planning new features or systems from scratch.
  * Gathers requirements, examines repo architecture, designs module boundaries, and optionally formats output as GitHub issues.

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

- **No Broken NPM Caches**: When installed via `npx`, skills are persisted in `~/.agents/skills/` before linking so symlinks survive cache purges.
- **Protected Paths**: `~/.claude/skills/synced` (Claude cloud sync) and `~/.codex/skills/.system` (Codex system skills) are protected and will never be overwritten, unlinked, or traversed.
- **Automatic Backups**: If an agent directory already contains physical files for a skill, they are renamed to `*.backup.<timestamp>` before creating the symlink, guaranteeing zero data loss.

---

## License

MIT © [imaimai86](https://github.com/imaimai86)
