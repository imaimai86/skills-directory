---
name: "tailor-cv-for-job"
description: "Tailor Muhammed Anas's CV to a posted job (LinkedIn, Indeed, careers page, or pasted JD) via the deepen skill, save the PDF to the CV folder, and return its path plus the job link. Use for any 'tailor my cv' request, one job or many."
---

# Tailor CV for a job

Goal: a 2-page PDF CV tailored to one job posting, built only from facts on the candidate's record, saved to `/Volumes/Work/Projects/claude-code/CV/`, and handed back with the job link. The user wants a short reply, not an essay.

## One job or many?

- **One job:** run the single-job flow below yourself.
- **Several jobs (several links, or a list):** spawn one `general-purpose` subagent per job **in the same turn**, so they run in parallel. Give each subagent this whole skill's instructions plus its one job link/JD, and tell it to work non-interactively (no questions to the user). As each finishes, relay its result line. Finish with one list: `CV path — job link` per job, plus one line per job for gaps.

## Single-job flow

### 1. Read the full JD
Never judge a job from its title. Try in order:
- WebFetch the URL.
- LinkedIn, Indeed, Oracle/Workday career sites usually block WebFetch or render client-side. Load the built-in browser in one call: `ToolSearch select:mcp__remote-devices__Claude_Browser__navigate,mcp__remote-devices__Claude_Browser__get_page_text`, navigate, then `get_page_text`. If the description hasn't loaded, call `get_page_text` once more.
- Attachment or pasted text: read it directly.

Capture: company, exact title, location/on-site/remote, salary if shown, must-haves, nice-to-haves, and any application instructions (for example "list role and stack per project").

### 2. Pick the professional (don't ask)
Choose the person on the hiring side whose judgment decides this hire: a specific archetype, never a real person. Examples from past runs: "engineering manager of a fintech payments squad", "healthtech CTO hiring a technical architect", "IT-services technical recruiter". Prefer the hiring manager for the team over a generic recruiter, unless the posting is from an agency or IT services firm.

### 3. Invoke deepen
Call the `deepen` skill with args that already name the goal and the professional, so it skips its lens question:
`Tailor Muhammed Anas's CV for <title> at <company> (<link>), as <professional>. JD summary: <must-haves / nice-to-haves>.`
The user's request to tailor the CV is the go-ahead, so treat deepen's gate as **Run it** and don't stop to ask. Keep its brief short. In a subagent, skip sending the brief to the user.

The prompt deepen writes must carry these acceptance criteria, at minimum:
1. Every claim traces to the candidate's record.
2. JD keywords that are on the record appear in the PDF text (`pdftotext | grep`).
3. JD skills that are *not* on the record are not claimed (list them explicitly).
4. Exactly 2 pages, page 2 reasonably full (`pdfinfo`, plus a `pdftoppm -r 50` thumbnail you look at).
5. Any role-specific check the JD invites (years stated vs role dates, payments evidence near the top, role + stack per project, and so on).

### 4. Execute the prompt

**Record (the only allowed sources of facts):**
- The latest dated CV in `/Volumes/Work/Projects/claude-code/CV/` (list the folder, take the newest `*-ANAS-CV*.pdf`, run `pdftotext`).
- Memory: `/topics/career-history.md`, plus the project copies `/projects/<project-id>/topics/career-achievements.md` and `/topics/career-history.md`.
- Project docs `CV/2026-ANAS-CV-2.md` and `CV/2026-AUG-ANAS-CV.md`.
- The candidate's public repos when a project is described (for example `github.com/techmanasi/ai-sdlc-helper`).

Anything else the user has confirmed in conversation also counts.

**Hard rules:**
- The header name is `MUHAMMED ANAS I`. Never write "Anju".
- Never claim a skill, tool, metric, title or outcome that isn't on the record, not even a softer version of it ("exposure to…"). Gaps go in the reply, never in the CV.
- Watch for small inflations reviewers keep catching: "instituted", "owned architecture", "design-level", "mentored", "speeding up onboarding", made-up outcomes like "eliminating duplicates", and merging facts from two employers into one sentence.
- Go is "working knowledge" and Python is "ETL jobs", unless the user says otherwise.
- Location is Dubai, UAE. Add "Available immediately for on-site work in Dubai" only for on-site roles. Drop "open to remote" for on-site roles.

**Tailoring:**
- Reorder rather than invent. Rewrite the summary in the JD's language. Order the skills rows to match the JD's sections. Lead each role with the bullets that match.
- Put a role first, out of date order, only when its domain is the JD's domain (for example Medable/healthcare first for a healthcare role).

**Build:**
Write HTML in the scratchpad, editing with Python find-and-replace that asserts each match occurs exactly once. Render with Playwright:
```js
const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+process.argv[2]);await p.pdf({path:process.argv[3],format:'A4',preferCSSPageSize:true});await b.close();})();
```
Use this CSS so every CV looks the same:
```css
@page { size: A4; margin: 14mm 15mm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.33; color:#111; background:#fff; margin:0; }
h1 { font-size: 19pt; margin: 0 0 3px; letter-spacing: .5px; }
.contact { font-size: 9.6pt; color:#333; }
h2 { break-after: avoid; font-size: 11pt; text-transform: uppercase; letter-spacing: .8px; border-bottom: 1.2px solid #222; padding-bottom: 2px; margin: 13px 0 6px; }
.job { margin-top: 9px; } li { break-inside: avoid; margin: 1.5px 0; } .jt,.jd,.co { break-after: avoid; }
.jt { font-weight: bold; } .jd { color:#444; font-size: 9.6pt; } .co { font-style: italic; color:#444; font-size: 9.6pt; margin: 2px 0; }
ul { margin: 3px 0; padding-left: 17px; } .stack { font-size: 9.4pt; color:#333; break-before: avoid; }
table.sk { border-collapse: collapse; width:100%; } table.sk td { vertical-align: top; padding: 1.5px 0; } table.sk td:first-child { font-weight: bold; width: 25%; }
p { margin: 3px 0; }
```

Sections, in order:
1. Header: name, phones, email, GitHub, location, availability
2. Professional Summary
3. Technical Skills table
4. Employment History, with an italic company line and a Stack line per role. Group pre-2016 roles as "Earlier roles".
5. Open Source / Projects
6. Education

If the CV runs to 3 pages, condense the earlier roles and trim weak bullets; don't shrink the font.

### 5. Independent review
Spawn an Agent with `model: "sonnet"`, `subagent_type: "general-purpose"`. Give it only:
- the goal
- the JD requirements
- the acceptance criteria
- the PDF path
- the record: file paths, plus the memory facts pasted inline, because the reviewer can't read your memory

It returns PASS/FAIL for each criterion, with the commands it ran. Fix real FAILs and re-render.

Ignore a flag when it only comes from the reviewer lacking a fact you verified on the record. Ignore its usual flags on the trailing "I" in the name and on the Dubai/availability line; both are the candidate's standard.

### 6. Save and share
- **Filename:** `{Company}-{yyyy}-{mm}-{dd}-ANAS-CV-{role-slug}.pdf`. Company comes first with no spaces (for example `Lean-2026-11-02-ANAS-CV-senior-swe.pdf`). When the employer is hidden, use the posting's best identifier.
- Call `SendUserFile` on the PDF (`status: normal`, `display: attach`). Then call `mcp__remote-devices__device_commit_files` with the returned `fileUuid`, writing to `/Volumes/Work/Projects/claude-code/CV/<filename>` (load the tool via ToolSearch if needed).
- If the computer isn't linked, say so in one line. The file is still in the chat.

### 7. Reply (keep it short)
```
CV: /Volumes/Work/Projects/claude-code/CV/<filename>
Job: <link>
Review: 1 PASS · 2 PASS · 3 PASS · 4 PASS (+ any unresolved FAIL)
Not claimed (gaps): <comma list of JD skills not on the record>
```
Add at most one line on a real risk: a hard stack mismatch, a 6-day week, salary well below his level, or relocation needed.

Don't apply to the job, send any message, or write a cover letter unless the user asks. Cover letters, when asked for, mention strengths only.