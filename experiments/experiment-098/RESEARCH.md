# Research — Experiment 098 (Saturday, open-source contribution)

Lane: Saturday — one real contribution to an open-source project Francisco uses.
Date: 2026-11-14 (UTC). Three scouts ran in parallel (gitleaks/sharp/lucide; dependencies of Francisco's own repos; better-sqlite3/yfinance/MCP). Every link below was opened in this run; the chosen one was re-checked by the main agent with `curl` and `gh`.

## Chosen target: ranaroussi/yfinance (used in Francisco's `financial-bot`)

| Source | Source date | Accessed | Takeaway |
|---|---|---|---|
| https://raw.githubusercontent.com/ranaroussi/yfinance/main/requirements.txt | no date | 2026-11-14 | Returns **404**: the file the docs download no longer exists. |
| https://github.com/ranaroussi/yfinance/blob/dev/doc/source/advanced/install.rst | dev @ 24ba84c (2026-11-09) | 2026-11-14 | Primary: the "install without curl_cffi" page still pipes that URL into pip, then runs `pip install --no-deps yfinance`. |
| https://ranaroussi.github.io/yfinance/advanced/install.html | no date | 2026-11-14 | The published docs page (200) shows the same broken command; README.md line 56 links here. |
| https://github.com/ranaroussi/yfinance/blob/dev/pyproject.toml | dev @ 24ba84c | 2026-11-14 | Primary: dependencies now live in `[project] dependencies` (curl_cffi>=0.15, pandas, numpy, requests…). |
| https://github.com/ranaroussi/yfinance/blob/dev/yfinance/_http.py | dev @ 24ba84c | 2026-11-14 | Primary: `try: from curl_cffi import requests … except ImportError: import requests` — removing curl_cffi after a normal install is supported. |
| https://github.com/ranaroussi/yfinance/blob/dev/CONTRIBUTING.md | no date | 2026-11-14 | PRs go to `dev`; no ban on AI-assisted contributions, no disclosure rule. |
| https://pypi.org/project/yfinance/ | 1.8.0 | 2026-11-14 | Version installed in the clean-venv reproduction. |
| `gh pr list -R ranaroussi/yfinance --state merged` | 2026-11-07 / 11-09 | 2026-11-14 | External PRs merged recently (e.g. a README badge docs fix on 2026-11-07, #3038 on 2026-11-09). |
| `gh search prs/issues -R ranaroussi/yfinance "curl_cffi" / "requirements.txt" / "install"` | — | 2026-11-14 | No open issue or PR covers this; open PRs #2846 and #2505 touch other files. |

## Shortlist (JUDGE: usefulness × freshness × feasibility × clear-cut, 1–5 each)

| Candidate | Problem | Score | Decision |
|---|---|---|---|
| **yfinance — install.rst** | Documented command 404s and leaves a broken install | 5×5×5×5 = **625** | **Chosen**: real user impact, reproducible before/after, Francisco uses the library |
| lucide — `packages/icons/README.md` | CDN snippet points to a UMD build that does not exist (404) | 4×4×4×3 = 192 | Runner-up; fix not tested in a browser |
| better-sqlite3 — `docs/api.md` | `sqlite.org/c3ref` and an old issue-comment link return 404 | 3×4×5×5 = 300 | Good backup for a future Saturday |
| ipaddr.js — README | Line anchors drifted to unrelated code | 3×4×5×3 = 180 | Anchors will drift again |
| send2trash — README.rst | Link to the retired GNOME wiki | 2×3×5×4 = 120 | Low impact |
| lucide-static README | 3 links to removed package folders | 2×3×5×5 = 150 | Low impact |

Ruled out: **modelcontextprotocol/servers** (CONTRIBUTING: "We accept issues, not pull requests"); **gitleaks** (only Dependabot merges since August); **sharp** (no broken link found among 833 checked; its template requires a human-written description).

## Checks required by ROUTINE.md 1S
- External PRs merged in the last 3 months: yes.
- AI policy: none; the commit carries a `Co-Authored-By: Claude` trailer, so the assistance is disclosed anyway.
- No duplicate issue/PR: confirmed.
- Freyesperales open PRs in this repo before today: none.
- Reproduction: fails before, works after (see `test-log.txt`).
