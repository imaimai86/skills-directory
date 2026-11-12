---
name: deepen
description: Turn a goal into a deeper (not bigger) task by looking at it the way a top professional in the field would. Names the rawest starting material, the specific methods and tools, and evidence from outside the conversation that the result is right. Supports several professional roles at different knowledge levels at once: generates one prompt per perspective, then compares them, combines them into one, or runs each in isolation. Rewrites each as a self-contained prompt that ends by having another agent, on a different model, review the result. Use when the user says "deepen", "do this like a pro would", "what would an expert do here", or invokes /deepen.
argument-hint: "[goal] [as <role>[:<level>][, <role>[:<level>]...]]"
---

# Deepen

Arguments: $ARGUMENTS

Each persona is a lens, not the deliverable. It earns its place only through the concrete things it forces into the open: raw material, named methods, and checks that don't depend on you or the user. Never let it widen the scope or override what the user wants.

## 1. Goal
- If the arguments contain a goal, use it. Otherwise ask for it with AskUserQuestion (offer 2–3 plausible readings drawn from the conversation, if there are any; the user can type their own with Other).
- Restate the goal in one line. If it is ambiguous in a way that changes the work, ask before going on.

## 2. Roles and knowledge levels
A **lens** is a professional role plus a knowledge level. One lens is the default; pick several when different perspectives would change the work (for example a security engineer, a product manager and a first-time user all reading the same design).

- If the arguments name roles (for example `as forensic accountant:senior, auditor:novice`), use them. Separate lenses with commas; `:level` is optional.
- Otherwise suggest the 3–4 closest roles with AskUserQuestion using **multiSelect**, each with a one-line reason it fits and how its perspective differs from the others. Pick specific roles ("staff SRE at a payments company", "copy editor at a national newspaper"), not generic ones ("expert"). Use role archetypes, never a real named person. Tell the user they can pick one or several, or type their own with Other.
- Maximum 4 lenses. If more are chosen, ask which to drop; more than 4 gives overlap, not depth.
- Set a knowledge level per lens, from this scale:
  - **Novice**: new to the field; asks basic questions, needs terms defined, catches jargon and unstated assumptions.
  - **Practitioner**: competent daily user; follows standard practice and known pitfalls.
  - **Senior expert**: years of depth; knows edge cases, trade-offs and failure history.
  - **Domain authority**: sets or audits the standard; works from primary sources, specs and first principles.
  Default is Senior expert unless the arguments or the role imply otherwise. If levels are not given and more than one lens is selected, ask once with AskUserQuestion (one question per lens, up to 4). A low level is a legitimate perspective (a novice lens finds what experts stop seeing), not a weaker one: it still needs concrete sources, methods and checks.

Lenses must differ in perspective or level. Merge or drop two lenses that would produce the same prompt.

## 3. Deep brief
Write the brief in the reply. Section **a** is written once, because the goal and scope are shared by all lenses. Sections **b–e** are written once per lens (heading each with `Lens N: <role> (<level>)`) when there are several. With one lens, use exactly sections a–e.

**a. Asked vs. deeper** (shared)
- *Asked:* the user's task as stated.
- *Deeper version:* the same scope, done to a higher standard: fewer assumptions, primary sources, a higher bar of evidence, edge cases the pro would not skip.
- *Out of scope:* what would make it **bigger** rather than deeper (extra features, adjacent problems, "while we're at it"). List them explicitly, so they stay out. Lenses never add scope; they only change how the same scope is examined.

**b. What this lens would do (not what was asked)**
Where this professional, at this level, would depart from the literal request, and why. Point out any part of the request they would push back on. For a lens below Senior expert, say what they would question, misread or find unclear, and why that matters.

**c. Rawest starting material**
The undigested sources this lens starts from, instead of summaries, dashboards or someone else's conclusions (for example raw logs over a log summary, the statute over a blog post about it, the actual schema over the docs). Tag each one:
`[available here]` · `[needs the user]` · `[not reachable]`

**d. Methods and tools**
Name the specific techniques, frameworks, instruments and tools, not vague ones like "analyse carefully". For each, say what it catches.

**e. Evidence that it is right, from neither Claude nor the user**
Checks that don't rely on the author's or the requester's judgment: a test or reproducible command, a measurement against a baseline, a primary source to cite, an independent calculation, a kind of human reviewer who would sign off. Prefer checks that can be run. Each one becomes an **acceptance criterion** in step 4.

**f. Cross-lens map** (only with several lenses)
A short table of where the lenses agree, where they conflict, and what only one of them sees. This drives the compare and combine options in step 5.

## 4. Rewritten prompts
Write one self-contained prompt per lens, each in its own fenced block labelled with the lens, so it can be copied and run anywhere with no knowledge of this conversation or the other lenses. Structure:

```
Role: <professional archetype> at <knowledge level> level, working at the standard described below.
Perspective: <what this lens cares about and what it must not assume; for lower levels, state what it may legitimately not know and must flag rather than guess>

Goal: <deeper version, one paragraph>

Start from: <raw material from 3c, with locations; flag items that need the user>

Methods: <from 3d>

Out of scope (do not do): <from 3a>

Acceptance criteria:
1. <check from 3e: how to run or verify it, and what counts as passing>
2. ...

Deliver: <the concrete output, its form and where it goes>

Independent review (required before you present the result):
When done, have your result reviewed by another agent in a separate session, on a model different from your own (for example Sonnet if you are Opus, Opus if you are Sonnet). Give the reviewer only the goal, the acceptance criteria and your result, not your reasoning or this conversation. The reviewer must return PASS or FAIL for each criterion, with the evidence it checked (commands run, sources opened). Fix each FAIL or report it as unresolved. Then present the result together with the review verdict for each criterion.
```

Keep each prompt the same size as the task. Depth goes into the criteria and the methods, not into extra deliverables.

### Presenting several prompts
With more than one lens, show the prompts side by side in a diff tool so the user can see where they differ. Always also print them in the reply (below), so nothing depends on the tool working.

1. **Choose the tool.**
   - If the user's arguments or conversation name a tool (for example "use meld", "use Beyond Compare"), use that one. If it is not installed, say so and fall through to detection.
   - Otherwise detect what is installed with `command -v`, in this order: `meld`, `bcompare`, `kdiff3`, `opendiff` (macOS FileMerge), `code` (use `code --diff`), `vimdiff`, `delta`. Graphical tools come first because the user can scroll and merge in them.
   - If several are found, use the first. Tell the user which you chose and that they can name another.
   - If none are found, skip to the fallback.
2. **Write the files.** Put each prompt in its own file in a new temporary directory (the session scratchpad if one is given, otherwise `mktemp -d`), named `<nn>-<role>-<level>.md`. Do not write them into the repo or the user's project. The files are editable: the user can copy parts between prompts, delete parts, or take one prompt whole, and what is saved in the files becomes the result.
   - With two prompts, both panes are editable: tell the user to save the version they want in either file, or a hand-merged result in both. Do not create `final.md`.
   - With three prompts, open all three files side by side (no `final.md`; a fourth file would not fit). Any pane can be edited. Tell the user to build the result in whichever file they prefer by copying parts from the others, and save it.
   - With four prompts, open pairs (see step 3). Edits are made in whichever files the user chooses.
3. **Open the tool.**
   - Two prompts: pass both files. Three prompts: `meld`, `bcompare` and `kdiff3` take three files (`meld a b c`, `kdiff3 a b c`); with other tools, open the pairs 1–2 and 1–3 (or ask which pair to compare). Four prompts: open pairs against the first prompt, or two 2-way windows (1–2, 3–4), whichever the tool supports.
   - Graphical tools block until closed, so run the tool command itself as a background task (the Bash tool's `run_in_background`), and do not wait. Do not wrap it in a shell `&` or a subshell: the task would then report "completed" as soon as the launcher exits, while the tool is still open. The task's completion notice is the signal that the tool was closed. If it ever arrives while the files are unchanged and the user has not said they are done, treat it as no change only after checking the tool process is gone (`pgrep -x <tool>`). Terminal tools (`vimdiff`, `delta`, `git diff --no-index`) cannot be shown interactively here, so print their output into the reply instead.
   - Tell the user to save the files (not just edit them) and close the tool when they have decided. When the tool exits, or the user says they are done, go to "Read back and confirm".
4. **Fallback (no tool, tool failed, or terminal-only tool).** Print each prompt in its own fenced block under its lens heading. Follow them with a compact table of what differs (role, level, raw material, methods, criteria, deliverable), and, if `diff` or `git diff --no-index --stat` is available, a short unified diff between the first and each other prompt.
5. **Read back and confirm** (graphical tool only). Read every file again.
   - If nothing changed, say so and carry on to the step 5 gate.
   - If something changed, show a short summary of what moved (which sections were copied or removed, per file) and ask with AskUserQuestion which prompt to go with: each edited file by lens name, and **Use all edited prompts as they are**. Put the file with the most edits first (marked Recommended). The user can choose several if they want to run several.
   - Check each chosen prompt still has Role, Goal, Start from, Methods, Out of scope, Acceptance criteria, Deliver and the Independent review block. If something was dropped, say what and ask whether to restore it from the original before running. Never run a prompt with the review block removed unless the user confirms. Do not rewrite the user's edits, and do not silently fix them.
   - Chosen prompts replace the originals for the rest of the run. A prompt built from several lenses is treated as a Combine prompt for step 6; if it mixes lenses, the isolated-run option no longer applies to it.
   - If the tool is closed without saving, treat that as no change.
6. **Say what happened.** One line stating the tool used (or that none was available), and the directory holding the files so the user can reopen them.

This applies to the Compare and Keep separate options in step 5. For Combine, show the merged prompt, and offer to open it against the separate prompts in the diff tool if the user wants to see what changed.

## 5. Gate
With one lens, ask with AskUserQuestion (name the goal in the question):
- **Run it**: execute the rewritten prompt here, now.
- **Edit**: the user says what to change; revise the brief and the prompt, then ask again.
- **Just give me the prompt**: stop; the prompt above is the deliverable.

With several lenses, ask how to handle them (name the goal, and list the lenses in the question):

1. **Prompt form**
   - **Compare**: keep the prompts separate and add a side-by-side table (role, level, what each starts from, methods, criteria, where they differ). Use when the user wants to choose or tune a perspective.
   - **Combine**: merge into one prompt. One Role line listing the lenses, one Goal, the union of raw material and methods (deduplicated), and the criteria grouped by lens and labelled with the lens that owns them. Add an instruction to work through each lens as a separate pass, record conflicts between lenses explicitly instead of averaging them away, and end with a short reconciliation section. Keep a single independent-review block covering every criterion. If two criteria or instructions contradict, keep both in the prompt, mark the conflict, and instruct the agent to stop at that point and surface it for the user to decide (see "Resolving disagreements" in step 6) rather than picking one or averaging them.
   - **Keep separate**: deliver each prompt as is, with no merge and no table.
2. **Execution** (skip if the user only wants prompts)
   - **Run in isolation**: run each lens prompt in its own subagent or session. They share no context, no intermediate results and no knowledge of each other, so one lens cannot anchor on another. Start them in parallel when they do not write to the same files; otherwise give each its own output location. Each runs its own independent review step.
   - **Run combined**: run the merged prompt as one task.
   - **Don't run**: stop at the prompts.
   - **Edit**: revise the lenses, levels or prompts, then ask again.

If the user chooses Run in isolation, also ask whether to **Synthesise** afterwards (one reconciled result plus a note of disagreements) or **Report separately** (each result delivered as is, with a short comparison).

## 6. Execute
If the user chooses to run, follow the chosen prompt(s) exactly as written, including the final review step. To bring in a reviewer, start a separate session or subagent and set its model explicitly to one other than the model running that prompt.

For isolated runs:
- Pass each subagent only its own prompt, never the brief, the other prompts or other lenses' results.
- Collect each result with its own reviewer verdict per criterion.
- Then, if the user chose Synthesise, first list every disagreement between the lenses and **let the user decide each one** (see below). Produce the single result only after the decisions are made. Keep what the lenses agree on, and do not drop a finding that only one lens made. If the user chose Report separately, deliver each result under its lens heading, then run the same disagreement resolution and finish with a comparison table showing each disagreement and the user's decision.

**Resolving disagreements (never decide silently)**
A disagreement is any point where lenses recommend different actions, give different facts or conclusions, or set criteria that cannot both pass. Applies to isolated runs, combined runs and reconciliation of the cross-lens map.
1. Collect them into a numbered list. For each: a one-line statement of the question, each lens's position with the evidence it gave (and its reviewer verdict), and your own recommendation with the reason. Mark it as a recommendation, not a decision.
2. Ask with AskUserQuestion, up to 4 disagreements per call (batch the rest in further calls). One question per disagreement; options are each lens's position (label it with the lens and level), plus **Combine both** or **Neither, I'll say** when they are not mutually exclusive. Put your recommended option first and mark it "(Recommended)". The user can always type their own answer with Other.
3. Apply exactly the user's choices. Record each decision in the final result as `Decision: <question> → <chosen position> (from <lens>)`, and keep the rejected position in a short "Not chosen" note so it is not lost.
4. If a chosen position fails its reviewer criterion or rests on `[not reachable]` evidence, say so when asking and again in the result, but still follow the user's choice.
5. If there are no disagreements, say so in one line and do not ask.

Report every result with the reviewer's verdict for each criterion, and say plainly which criteria failed or could not be checked, and which lens each belongs to.
