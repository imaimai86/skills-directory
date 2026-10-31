---
name: indeed-job-application
description: Apply to ONE pending job from the Indeed job-leads tracker (indeed-job-leads-review.md in the CV project) end-to-end — opens the job's Indeed link, drives Indeed's own "Apply with Indeed" (smartapply.indeed.com) flow, matches screener questions against the CV and the reusable answer profile, asks the user for anything genuinely unknown, and always pauses for explicit confirmation before the final Submit click. Updates the tracker row's Status when done. Designed to be invoked once per job — e.g. by /loop — so each run processes exactly one pending application and checkpoints cleanly. Trigger when the user says "apply to the next Indeed job", "work through the Indeed tracker", "continue the Indeed job hunt", or similar; also trigger to process a single Indeed job URL/ID directly if one is given outside the tracker flow.
---

# Applying to a pending job from the Indeed tracker

> ## HARD RULE — never skip or grade a job from its title, or without analysing the JD
>
> ***Never ever skip a job by reading only the title or without analysing the JD.*** Before any Apply / Maybe / Skip decision, the full job description ("About the job", fully expanded) must be read and analysed. Every job gets its own tracker row with a link and a **job-specific reason taken from the JD** — no lumped rows, no "title-only" rows, no keyword-scan grading. If the JD can't be loaded, mark the job **"JD not read"** and retry; never skip it or guess. Python-primary roles are not an automatic skip. Log every job searched in each round, with reasoning for why it isn't a good fit, in `job-search-rounds-log.md` (CV project). This rule is also in the CV project's `CLAUDE.md`.

This skill processes **one job per invocation**. Don't try to clear the whole tracker in a single run — apply to one job, update its status, and stop. The calling loop (see "Loop integration" below) decides whether to invoke again.

## Step 0 — Find the tracker and the next pending job

The tracker lives at `indeed-job-leads-review.md` in the CV project directory (alongside `job-search-review.md` and `uae-job-leads-review.md`, which are LinkedIn-sourced and out of scope for this skill). If it doesn't exist yet, this skill has nothing to do — tell the user to run an Indeed search first (see "Re-running the search" below) to populate it.

Read the tracker's status legend at the top of the file, then find the **first row with Status `pending`**. That's this run's target. If no `pending` rows remain:
1. Report that the tracker is clear.
2. Ask whether to re-run the Indeed search now to find fresh openings (see "Re-running the search"), rather than silently looping forever with nothing to do.

## Step 1 — Load the CV and the reusable answer profile

Same sources the LinkedIn skill uses — check for a `job_application_profile.md` (or similar) in the CV project directory, and use the current CV file: `/Volumes/Work/Projects/claude-code/CV/2026-ANAS-CV-4.pdf` (the latest version as of 2026-09-28 — if a higher-numbered `*CV*.pdf` exists later, use that instead and treat this path as a snapshot, not permanent). Also check whether the same job/company already has an application on file in the LinkedIn-sourced trackers (`job-search-review.md`, `uae-job-leads-review.md`) — per standing instruction, apply on Indeed anyway even if already applied via LinkedIn, and **reuse the same answers** given there for consistency rather than re-deriving them.

### Standing answer defaults for UAE-based roles (confirmed with the user; reuse without re-asking unless a posting's context clearly changes the right answer)

- Name / email: as on the Indeed account profile (pre-filled — verify, don't overwrite with guesses).
- **Phone: always +971 50 290 8381 (UAE number), even though the Indeed account's stored profile defaults to the Indian number (+91 94963 71048).** The user explicitly wants to apply to UAE jobs as someone reachable in the UAE (Golden Visa holder, relocating fully within about a month) — check this field on every application and correct it if it's pre-filled with the Indian number. See the phone country-code dropdown workaround below if the UI resists the switch.
- Location: Dubai, UAE. Willing to relocate: **No** (already based there) — this is the opposite of the "Yes" default used for the EU-focused LinkedIn tracker; don't cross-apply that default here.
- Visa sponsorship needed: **No** (UAE Golden Visa holder) — not applicable for these UAE roles.
- LinkedIn URL: `https://www.linkedin.com/in/muhammed-anas-598b7518/`
- Current salary: **AED 360,000/year** (matches the minimum-salary preference already on the Indeed profile) — this was the salary at Medable, now the most recent former role. Expected salary: **"Negotiable"** / open to discuss based on role scope.
- Employment status: **left Medable in August 2026** (4 years 8 months there, Jan 2022–Aug 2026) — not currently employed. If a screener asks "are you currently employed," answer honestly based on this.
- Notice period / start date: **Immediate** — no notice period to serve, available to join right away. This replaced the earlier "~1 month" default (2026-09-28) now that the user has actually left Medable.
- When a form requires a portfolio/work-sample link and no dedicated portfolio exists: use the LinkedIn URL above as a stand-in (confirmed acceptable by the user during the ImagineArt application) — don't re-ask for this specific case, but do mention in your summary that this is what was used.

Anything else the posting asks that isn't covered above or by the CV — ask the user via `AskUserQuestion`, batched. Never fabricate an answer, especially numbers (salary, years of experience) — see the same rule in the `linkedin-job-apply` skill for why this matters.

## Step 2 — Open the job and start the apply flow

1. `tabs_context_mcp` (createIfEmpty: true) if you don't already have a tab.
2. `navigate` to the tracker row's Link (a `to.indeed.com/...` short link). It resolves to `indeed.com/viewjob?jk=...`.
3. **Domain quirk**: `computer` screenshot actions can return "Permission denied for this action on this domain" on `www.indeed.com` pages. Don't fight this — use `get_page_text` and `find` (which work fine there) to read the page and locate the "Apply with Indeed" button, and click it via its `ref` (from `find`), not by coordinate. Screenshots work normally once you land on `smartapply.indeed.com` — use them freely from that point on.
4. If an "Updates to our Terms of Service — Accept Terms" `alertdialog` appears: this is an account-level terms acceptance, which needs the user's explicit go-ahead (it's not a per-application form field). Ask via `AskUserQuestion` before clicking Accept. In practice this dialog can also resolve itself between checks — re-check with `find` before assuming it's still blocking you.
5. **A Cloudflare "Additional Verification Required" / "Verify you are human" interactive CAPTCHA can appear on `www.indeed.com` job pages**, seemingly independent of whether the browser session is otherwise logged in (confirmed the account was authenticated via `in.indeed.com` and the CAPTCHA still appeared on the job link). Do not attempt to solve it — that's a hard line, not a judgment call. Mark the job `blocked` in the tracker with a short note, and tell the user the link so they can open it themselves (same real Chrome tab, via claude-in-chrome) and click through the human-verification step. Once they confirm it's cleared, resume driving the rest of the apply flow normally — the CAPTCHA only gates that one page load, not the whole session.
5. Clicking "Apply with Indeed" navigates to `smartapply.indeed.com/beta/indeedapply/form/...` — this is Indeed's own multi-step apply flow (not a third-party ATS in an iframe, unlike most LinkedIn Easy Apply flows).

## Step 3 — Work through the smartapply steps

Each step is its own page/URL under `smartapply.indeed.com/beta/indeedapply/form/`. Observed steps, in order (a given posting may skip some):

1. **`contact-info-module`** — First/Last name and email, pre-filled from the Indeed account. Verify against the CV; don't overwrite with guesses. Click Continue.
2. **`resume-selection-module`** — "Use your Indeed Resume" is normally pre-selected and recommended; confirm it's reasonably current (spot-check against the CV) rather than assuming. An "Upload a resume" option exists if a different file is needed — ask the user which file if it's not obvious. Click Continue.
3. **`questions-module/questions/N`** (one or more pages) — employer screener questions. These vary per posting: LinkedIn link, portfolio/work-sample link, current/expected salary, years of experience, work authorization, etc. Fill from the CV + the standing defaults above; ask the user for anything else via `AskUserQuestion`, batched per page rather than one question at a time.
4. **`review-module`** — full read-back of every value about to be submitted, with "You won't be able to edit your application after you submit." Scroll all the way down — this page is long (it re-renders the full resume text) and the actual "Submit your application" button is at the very bottom, well past what a single screenshot shows.

### UI notes specific to this flow
- `read_page` with `filter: interactive` can return many duplicate "Continue" button refs (the SPA keeps hidden step nodes in the DOM). Don't click a ref blindly when there are duplicates — take a screenshot and click the visibly-rendered button by coordinate instead.
- After clicking Continue/Submit, the button shows a spinner — wait ~2s and re-screenshot rather than assuming the click had no effect.
- **Phone country-code dropdown (contact-info step) can silently refuse a direct switch.** It's a custom div-based combobox (not a native `<select>` — `form_input` fails on it with "Element type DIV is not a supported form input"). Clicking straight from one country (e.g. India +91) to the target (e.g. UAE +971) can repeatedly close the dropdown without applying the new selection, no matter how precisely you click the row or use `find`-based refs — this happened consistently across many attempts in one run. **Workaround confirmed to work**: select a different, unrelated country first (any random one), then reopen the dropdown and select the actual target country. Going through an intermediate selection breaks whatever state was stuck. If automated attempts fail after 2-3 tries, this two-step workaround is worth trying before escalating to the user — don't burn many more retries on the direct switch. **Once fixed, it sticks**: the corrected number (+971 50 290 8381) persisted into the Indeed account profile and pre-filled correctly on the very next application — this is a one-time fix per account, not a per-application chore. Just verify it's still +971 each time rather than assuming the workaround is needed again.
- **Checkbox-group screener questions can cap the number of selections** (e.g. "Which cloud technologies are you experienced with?" capped at 3, rejecting AWS+Azure+GCP+"All of the above" = 4 with "Choose 3 or less options to continue"). If the honest answer plus an "All of the above"-style option exceeds the cap, drop the umbrella option and keep the specific ones — don't discover this only after a failed Continue click; watch for a red validation message and fix inline rather than assuming the click failed.
- **A numeric-looking screener field ("salary expectations", "years of experience") can silently require digits only** — typing "AED 360,000" into a field labelled "(in local currency)" produced "Answer must be a valid number (decimals allowed)" on Continue. Strip currency codes/commas down to a bare number (e.g. "360000") when a field's own label implies a plain numeric answer, even if an earlier, differently-worded field on the same posting accepted "AED 30,000" as free text.

## Step 4 — Stop before Submit, always

Identical bar to the LinkedIn skill — no prior "go ahead" in the conversation carries forward to this click:

1. Summarize what's about to be submitted: which resume, every screener answer, contact info.
2. Ask the user for explicit confirmation via `AskUserQuestion` (not just narration).
3. Take a **fresh screenshot immediately before clicking** the "Submit your application" button (don't reuse an earlier screenshot's coordinates — the review page is long and scroll position matters).
4. Click, wait ~2s, screenshot again, and confirm the result page actually reads "Your application was submitted to `<Company>`" — don't report success from the click alone.

## Step 5 — Update the tracker

Edit the tracker row for this job:
- On success: Status → `applied (YYYY-MM-DD)`.
- If genuinely stuck (a required field with no good answer, a login wall, an anti-spam block): Status → `blocked`, and add a short note under the table (see the ImagineArt notes section for the format) explaining what's blocking it — mirror the `manual-application-reference.docx` pattern used for LinkedIn's Ashby-blocked applications if the user needs to finish it by hand.
- If closer reading of the JD during this run reveals a real disqualifier missed during the original triage: don't silently flip it to `skip` — tell the user what you found and confirm before changing the assessment.

Report back: which job, what was submitted, and the tracker's current pending count.

## Loop integration

This skill is meant to be driven by `/loop`, one invocation per job, so the user can interrupt between applications and every submit still gets its own explicit confirmation. Each run should:
- Process exactly one `pending` row (Step 0), not the whole backlog.
- End cleanly whether it applied, got blocked, or found the tracker empty — never leave a half-filled form open across invocations.

When the tracker has no `pending` rows left, don't keep looping silently — surface that fact and prompt re-running the search (below) so the loop has fresh work, or stop the loop if the user doesn't want more.

## Re-running the search

Use the Indeed MCP tools (`mcp__claude_ai_Indeed__search_jobs`, `get_job_details`) with the same search terms/location used for the existing batch (see the tracker's batch header for what was searched) to find new postings. Cross-check against every row already in the tracker (by company + title, and by the underlying `jk=` job id where visible) before adding a row — don't re-add a job that's already `applied`, `skip`, or `blocked`. Append new rows as a new dated batch section, each starting at `pending` (or `skip` with a reason, following the same fit-assessment logic already used — hard language/domain mismatches, residency restrictions, etc.), so `/loop` has fresh material to work through.
