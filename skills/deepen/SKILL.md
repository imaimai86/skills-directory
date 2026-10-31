---
name: deepen
description: Turn a goal into a deeper (not bigger) task by looking at it the way a top professional in the field would. Names the rawest starting material, the specific methods and tools, and evidence from outside the conversation that the result is right. Then rewrites it as a self-contained prompt that ends by having another agent, on a different model, review the result. Use when the user says "deepen", "do this like a pro would", "what would an expert do here", or invokes /deepen.
argument-hint: "[goal] [as <professional>]"
---

# Deepen

Arguments: $ARGUMENTS

The persona is a lens, not the deliverable. It earns its place only through the concrete things it forces into the open: raw material, named methods, and checks that don't depend on you or the user. Never let it widen the scope or override what the user wants.

## 1. Goal
- If the arguments contain a goal, use it. Otherwise ask for it with AskUserQuestion (offer 2–3 plausible readings drawn from the conversation, if there are any; the user can type their own with Other).
- Restate the goal in one line. If it is ambiguous in a way that changes the work, ask before going on.

## 2. Professional
- If the arguments name a professional (for example "as a forensic accountant"), use it.
- Otherwise suggest the 2–3 closest roles with AskUserQuestion, each with a one-line reason why it fits. Pick specific roles ("staff SRE at a payments company", "copy editor at a national newspaper"), not generic ones ("expert").
- Use role archetypes, never a real named person.

## 3. Deep brief
Write the brief in the reply, with exactly these sections:

**a. Asked vs. deeper**
- *Asked:* the user's task as stated.
- *Deeper version:* the same scope, done to a higher standard: fewer assumptions, primary sources, a higher bar of evidence, edge cases the pro would not skip.
- *Out of scope:* what would make it **bigger** rather than deeper (extra features, adjacent problems, "while we're at it"). List them explicitly, so they stay out.

**b. What a top professional would do (not what was asked)**
Where the professional would depart from the literal request, and why. Point out any part of the request a pro would push back on.

**c. Rawest starting material**
The undigested sources a pro starts from, instead of summaries, dashboards or someone else's conclusions (for example raw logs over a log summary, the statute over a blog post about it, the actual schema over the docs). Tag each one:
`[available here]` · `[needs the user]` · `[not reachable]`

**d. Methods and tools**
Name the specific techniques, frameworks, instruments and tools, not vague ones like "analyse carefully". For each, say what it catches.

**e. Evidence that it is right, from neither Claude nor the user**
Checks that don't rely on the author's or the requester's judgment: a test or reproducible command, a measurement against a baseline, a primary source to cite, an independent calculation, a kind of human reviewer who would sign off. Prefer checks that can be run. Each one becomes an **acceptance criterion** in step 4.

## 4. Rewritten prompt
Write one self-contained prompt in a fenced block, so it can be copied and run anywhere with no knowledge of this conversation. Structure:

```
Role: <professional archetype>, working at the standard described below.

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

Keep the prompt the same size as the task. Depth goes into the criteria and the methods, not into extra deliverables.

## 5. Gate
Ask with AskUserQuestion (name the goal in the question):
- **Run it**: execute the rewritten prompt here, now.
- **Edit**: the user says what to change; revise the brief and the prompt, then ask again.
- **Just give me the prompt**: stop; the prompt above is the deliverable.

## 6. Execute
If the user picks Run it, follow the rewritten prompt exactly as written, including its final review step. To bring in the reviewer, start a separate session or subagent and set its model explicitly to one other than your own. Report the result with the reviewer's verdict for each criterion, and say plainly which ones failed or could not be checked.
