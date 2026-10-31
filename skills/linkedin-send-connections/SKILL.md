---
name: linkedin-send-connections
description: Work through linkedin-connect-tracker.csv and send LinkedIn connection requests (with the drafted note) to people whose Status is Approved, in rounds - default 5 people per round, with a random 10-20 minute gap between each request, scheduled automatically. Use when the user says "send the connection requests", "connect with the people in the tracker", "run the LinkedIn connect round", "start outreach", or schedules/loops this. Needs linkedin-find-contacts to have filled the CSV first. Only sends to Approved rows.
---

# LinkedIn: send connections (rounds with random spacing)

Project dir: `/Volumes/Work/Projects/claude-code/CV`. Tracker: `linkedin-connect-tracker.csv` (columns defined in `linkedin-find-contacts`). State: `linkedin-connect-round.json`.

## Why the pacing
Bursts of requests get LinkedIn accounts restricted. A random 10-20 min gap between requests and a small round size look human and protect the account. The gap must be random each time (not a fixed 15), so pick it with `python3 -c "import random;print(random.randint(600,1200))"` rather than choosing a "random-looking" number yourself.

## Parameters
- `round_size`: default 5 (user may override, e.g. "round of 8"). Warn if >10 or if more than ~20 requests were sent in the last 7 days (check `date_sent`).
- gap: random integer 600-1200 s between sends.

## One invocation = send at most ONE request, then schedule the next
1. Read `linkedin-connect-round.json` (create if missing/stale: `{"round_started": "<ISO now>", "round_size": N, "sent_this_round": 0}`). If `sent_this_round >= round_size`, the round is done: report a summary and stop (do not schedule). A new round starts only when the user asks again.
2. Read the CSV; pick the first row with `status == Approved`. None left → report and stop.
3. Open `profile_url` in your own Chrome tab. Check state first:
   - Already 1st degree / "Pending" invitation shown → set status `Already connected` (or `Sent` with misc "already pending") and continue to step 2 without counting it or waiting.
   - Only "Follow" with Connect hidden under "More" → use More → Connect. If no Connect option exists, set `Skipped`, misc "no connect option", move on.
4. Click Connect → "Add a note" → paste `note_draft` (verify ≤200 chars; if over, shorten rather than send truncated) → Send. If LinkedIn says note limit reached / asks for email / shows a captcha or "weekly invitation limit": stop the whole run, set row back untouched, tell the user.
5. Verify the button now reads "Pending". Update the row: `status=Sent`, `date_sent=<ISO>`; failures → `Failed` with the reason in `misc`. Bump `sent_this_round`. Write the CSV with Python's `csv` module.
6. If more are due in this round and Approved rows remain: pick the random gap and call **ScheduleWakeup** with `delaySeconds=<gap>` (valid range 60-3600), `prompt` = the same prompt that invoked this skill (e.g. "/linkedin-send-connections round 5"), noop false, reason naming who's next and the gap. Then end your turn; don't busy-wait or sleep.
7. Tell the user briefly: sent to X, N of M done, next in ~G min.

## Rules
- Only `Approved` rows. The approval gate is the user's explicit status flip in the CSV (or a clear "send them all" in chat for the current Pending batch, in which case show the list and notes first).
- Never alter note text beyond shortening; never claim India residence; one tab, close it when done.
- If the user wants it fully unattended on a calendar (e.g. "every weekday 10am"), suggest the `schedule`/`loop` skill wrapping this one; the wakeup chain above handles the gaps within a round.
