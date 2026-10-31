---
name: linkedin-find-contacts
description: Build the LinkedIn outreach list for Anas's job hunt. For each company he applied to (tracked jobs marked Applied/Apply), find who to connect with using a priority cascade - (1) the person who posted the job / "Meet the hiring team", else (2) recruiters/talent acquisition at that company, else (3) HR people there, else (4) senior/manager roles there - and then, as a secondary search, alumni: people currently at that company who previously worked at one of his own past employers (Namshi, Hey Platform, Medable, QBurst, others on his CV; no time overlap needed). Adds them to linkedin-connect-tracker.csv with Status and Misc columns. Use whenever the user says "find people to connect with", "who can I reach out to at <company>", "find the recruiter/hiring manager for my applications", "find alumni at companies I applied to", or "update the connect list" - even without mentioning the CSV. Research only; never sends requests (use linkedin-send-connections).
---

# LinkedIn: find contacts

Research only. Nothing in this skill sends a request or message, because outreach is outward-facing and goes through the approval gate in `linkedin-send-connections`.

Project dir: `/Volumes/Work/Projects/claude-code/CV`. Tracker: `linkedin-connect-tracker.csv` there.

## Inputs
- Applied companies: run `python3 ~/.claude/skills/linkedin-find-contacts/scripts/applied_companies.py` (default: UAE tracker; `--trackers uae,indeed,remote` to widen only when the user asks; `--json` for structured output). It parses every tracker table and classifies the Status cell by its first words (Applied/Submitted = applied; Not Applied, Skipped, Not found, JD not read = excluded), because statuses are free text and a skipped row can mention "cover letter". A company counts as applied if any of its rows is applied. Show the resulting list (and its `NEEDS A LOOK` rows) to the user before searching so they can add companies applied to outside the trackers or remove any. Honour a narrower scope if given (e.g. UAE only).
- Employers for the former-colleague search: read them from the latest CV (`2026-ANAS-CV-5.pdf`/`2026-ANAS-CV-2.md`), don't hardcode; verify the filename exists.

## Method (Chrome tools: load via ToolSearch in one call; start with tabs_context_mcp, use your own tab)
1. **Resolve company IDs once** (needed for the alumni search and the current-company filter). Open each company's LinkedIn page (applied companies and the user's previous employers) and read the numeric ID from the page/links (e.g. the People link `...currentCompany=%5B%22<id>%22%5D`). Cache in `linkedin-company-ids.json` next to the CSV so later runs skip this.
2. **PRIMARY search, per applied company: a priority cascade.** Work down the tiers and stop at the first tier that yields usable people (max 2 per company from the winning tier, since more reads as spam). Record the tier in `contact_type`.
   - **Tier 1 `job_poster`**: open the job link; if "Meet the hiring team" / the poster's name is shown, that person comes first. Closed postings usually hide it, so don't lose time there: fall through.
   - **Tier 2 `recruiter`**: `https://www.linkedin.com/search/results/people/?currentCompany=%5B%22<id>%22%5D&keywords=recruiter%20OR%20%22talent%20acquisition%22` (or without the ID: `keywords=recruiter <company>`). Headline must show they work there now. For UAE jobs prefer UAE-based recruiters, and recruiters for technical/engineering roles over unrelated ones.
   - **Tier 3 `hr`**: same search with `HR OR "human resources" OR "people operations" OR "people & culture"`.
   - **Tier 4 `senior_manager`**: engineering manager / head of engineering / director / VP / CTO / senior or staff engineer at that company (prefer engineering leadership, since it matches the role).
   Prefer 2nd-degree over 3rd (note limit/connectability), and people with mutual connections. 1st-degree people are already connected: log as `Already connected` and stop the cascade for that company (a DM is better than a connect; mention in misc).
3. **SECONDARY search (alumni), per applied company**: people currently at the applied company who previously worked at one of the user's past employers (Namshi, Hey Platform, Medable, QBurst + any on the latest CV; read it, don't hardcode). No time overlap needed. Search:
   `https://www.linkedin.com/search/results/people/?currentCompany=%5B%22<A_id>%22%5D&pastCompany=%5B%22<P_id>%22%5D&network=%5B%22F%22%2C%22S%22%5D`
   Max 2 per company, `contact_type=alumni_at_target`, `worked_together` = the shared past employer (plus years if the profile shows an overlap), `misc` = mutual names. These come in addition to the primary pick, because a warm shared-employer path often converts better; skip if a person is already in the CSV from the cascade.
4. Do not open every profile; the search card gives name, headline, degree, location, mutual connections. Pause between searches and stay under ~15 searches per run to avoid LinkedIn rate limits. If LinkedIn shows a captcha/security check, stop and tell the user.
5. Get each profile URL (read_page/find for the result link; strip tracking params).

## CSV columns (create with header if missing; keep order)
`id,name,profile_url,headline,company,location,contact_type,degree,mutual_connections,worked_together,job_title,job_link,source_tracker,note_draft,status,date_added,date_sent,misc`

- `contact_type`: job_poster | recruiter | hr | senior_manager | alumni_at_target
- `worked_together`: e.g. "Namshi 2019-2021" or blank
- `note_draft`: ≤200 characters (LinkedIn's limit; count it). Recruiters/managers: mention the specific role applied for, say Dubai-based, Node.js/TypeScript/AWS backend, available immediately. job_poster/recruiter/hr/senior_manager: mention the specific role applied for, Dubai-based, Node.js/TS/AWS, available immediately. alumni_at_target: warm, mention the shared former employer (e.g. Namshi) and that the user recently applied for the <job_title> role at their current company; light ask to connect, no CV attached. Never imply India residence.
- `status`: `Pending` (new, needs user review), `Approved` (user OK'd; only these get sent), `Sent`, `Already connected`, `Skipped`, `Failed`
- `misc`: anything else (e.g. "also messaged on Indeed", "company hiring mainly in KSA", "recruiter left company", mutual names)
- Always quote fields containing commas. Write with Python's `csv` module, not string concatenation.

## Rules
- Dedupe by `profile_url` against existing rows (and against people already logged as connected/sent in the tracker .md files, e.g. grep names).
- New rows always start as `Pending`. Never set `Approved` yourself.
- Finish by printing a table of added rows (name, company, type, note) and telling the user to flip the ones they want to `Approved`.
