#!/usr/bin/env python3
"""List companies the user applied to, parsed from the job-lead tracker tables.

Usage: python3 applied_companies.py [--dir CV_DIR] [--trackers uae,indeed,remote] [--json]

Classification is by the START of the Status cell (bold marks stripped), because
statuses are free text and "Skipped ... cover letter drafted" must not match "applied".
Companies with an applied row count as applied even if another batch says "Not Applied".
"""
import argparse, json, re, sys
from pathlib import Path

FILES = {"uae": "uae-job-leads-review.md", "indeed": "indeed-job-leads-review.md",
         "remote": "remote-job-leads-review.md"}
APPLIED = re.compile(r"^(applied|submitted)\b", re.I)
EXCLUDED = re.compile(r"^(not applied|skipped|not found|jd not read|not captured)", re.I)

def clean(s):
    return re.sub(r"\s+", " ", s.replace("**", "").replace("*", "")).strip()

def norm(c):
    c = re.sub(r"\(.*?\)", "", clean(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", c).strip()

def link(s):
    m = re.search(r"https?://[^\s)|]+", s)
    return m.group(0) if m else ""

def parse(path, tracker):
    rows, cols = [], None
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            cols = None
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells and cells[0].lower() == "job title":
            cols = [clean(c).lower() for c in cells]
            continue
        if cols is None or set("".join(cells)) <= set("-: "):
            continue
        if "status" not in cols or "company" not in cols or len(cells) < len(cols):
            continue
        d = dict(zip(cols, cells))
        rows.append({"tracker": tracker, "company": clean(d["company"]), "title": clean(d.get("job title", "")),
                     "status": clean(d["status"]), "link": link(d.get("link", "")), "location": clean(d.get("location", ""))})
    return rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="/Volumes/Work/Projects/claude-code/CV")
    ap.add_argument("--trackers", default="uae")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    rows = []
    for t in a.trackers.split(","):
        p = Path(a.dir) / FILES[t.strip()]
        if not p.exists():
            print(f"missing: {p}", file=sys.stderr); continue
        rows += parse(p, t.strip())
    comps, unclear = {}, []
    for r in rows:
        if APPLIED.match(r["status"]):
            c = comps.setdefault(norm(r["company"]), {"company": r["company"], "jobs": []})
            c["jobs"].append({k: r[k] for k in ("title", "link", "status", "tracker", "location")})
        elif not EXCLUDED.match(r["status"]) and re.search(r"appl|submit|sent", r["status"], re.I):
            unclear.append(r)  # mentions applying but doesn't start with it: let the user decide
    out = {"applied": sorted(comps.values(), key=lambda c: c["company"].lower()),
           "needs_a_look": unclear}
    if a.json:
        print(json.dumps(out, indent=2)); return
    for c in out["applied"]:
        j = c["jobs"][-1]
        print(f"{c['company']:<28} {j['title'][:40]:<40} {j['link']}  [{len(c['jobs'])} row(s)]")
    if unclear:
        print("\nNEEDS A LOOK (status unclear):")
        for r in unclear: print(f"  {r['company']} | {r['title']} | {r['status'][:80]}")

if __name__ == "__main__":
    main()
