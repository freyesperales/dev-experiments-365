# Research — Experiment 105 (Saturday, open-source contribution)

Lane: Saturday — one real contribution to an open-source project Francisco uses.
Date: 2026-11-21 (UTC). The checks were run by the main agent with `git`, `gh` and `curl`; no scouts were launched because the starting point was last Saturday's shortlist (experiment 098) and each item only needed to be re-verified. Every link below was requested in this run.

## First: last Saturday's pull request
| Source | Source date | Accessed | Takeaway |
|---|---|---|---|
| https://github.com/ranaroussi/yfinance/pull/3045 | comment 2026-11-15, commit 2026-11-16 | 2026-11-21 | A maintainer objected that the first version did not help when installing `curl_cffi` fails. The PR was reworked on 2026-11-16 (`pip install --no-deps yfinance` plus the dependencies by name). Still open, no further comments. Nothing to do today, and no second PR in that repository. |

## Chosen target: WiseLibs/better-sqlite3 (used in Francisco's `whenfree`)
| Source | Source date | Accessed | Takeaway |
|---|---|---|---|
| https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md | master @ e6f92bf (2026-11-14) | 2026-11-21 | Primary: line 441 links "SQLite C API" to `https://www.sqlite.org/c3ref`. |
| https://www.sqlite.org/c3ref | no date | 2026-11-21 | Primary: **404**, with and without trailing slash, with curl's and a browser's user agent. |
| https://www.sqlite.org/c3ref/intro.html | no date | 2026-11-21 | Primary: 200, page title "Introduction" of the C-language interface reference. Chosen as the new target. |
| https://www.sqlite.org/cintro.html | no date | 2026-11-21 | Primary: 200, "An Introduction To The SQLite C/C++ Interface". Alternative target; not chosen because the file's other links stay inside `c3ref/`. |
| https://github.com/WiseLibs/better-sqlite3/blob/master/docs/contribution.md | master @ e6f92bf | 2026-11-21 | Primary: contribution principles; no ban on AI-assisted contributions and no disclosure rule. No linter or PR template. |
| https://github.com/WiseLibs/better-sqlite3/pull/1521 | merged 2026-11-14 | 2026-11-21 | Primary: a pull request from an outside contributor merged within the last 3 months. |
| https://github.com/JoshuaWise/better-sqlite3/issues/534 | issue from 2021 | 2026-11-21 | Old-owner URL used in `docs/api.md` line 43. 404 for curl's default user agent, **301 to WiseLibs/better-sqlite3 with a browser user agent**. Not broken for readers; left out. |
| https://github.com/WiseLibs/better-sqlite3/issues/534 | issue from 2021 | 2026-11-21 | 200; the comment the docs point to exists. |
| `gh search prs/issues --repo WiseLibs/better-sqlite3` ("c3ref", "broken link", "dead link") | — | 2026-11-21 | No open issue or PR covers it (only #383, closed, about release notes). Open docs PRs #1534 and #1526 touch other lines. |
| `gh search prs --author freyesperales --state open` | — | 2026-11-21 | No open PR from Francisco in this repository before today. |

## Other candidates looked at today
| Source | Source date | Accessed | Takeaway |
|---|---|---|---|
| https://github.com/lucide-icons/lucide/blob/main/packages/icons/README.md | main @ c1a02a0 (2026-11-20) | 2026-11-21 | Primary: the CDN section loads `@lucide/icons@latest/dist/umd/lucide.js` in a plain `<script>` tag. |
| https://unpkg.com/@lucide/icons@latest/dist/umd/lucide.js | 1.77.0 | 2026-11-21 | 404: the package builds only `cjs` and `esm` (its `rollup.config.mjs`). The "production" URL resolves to an ES module, which a plain `<script>` tag cannot load. |
| https://unpkg.com/lucide@latest/dist/umd/lucide.js | 1.77.0 | 2026-11-21 | 200: the same snippet is correct for the `lucide` package, so the problem is only in the `@lucide/icons` README. |
| `gh pr list -R gitleaks/gitleaks --state merged` | latest 2026-10-23 | 2026-11-21 | Only Dependabot merges since June; still ruled out. |
| `gh pr list -R lovell/sharp --state merged` | 2026-11-12 / 11-13 | 2026-11-21 | Outside PRs merged this month, including a docs clarification. Worth a look on a future Saturday; no defect found yet. |

## Shortlist (JUDGE: usefulness × freshness × feasibility × clear-cut, 1–5 each)
| Candidate | Problem | Score | Decision |
|---|---|---|---|
| **better-sqlite3 — `docs/api.md` line 441** | Link to the SQLite C reference returns 404 | 2×4×5×5 = **200** | **Chosen**: small but unambiguous, reproducible, one line |
| lucide — `packages/icons/README.md` | CDN snippet points to a build that is not published | 4×4×3×2 = 96 | Not today: the right fix (remove the section, document an ES module import, or publish a UMD build) is the maintainers' decision. Better raised as an issue first. |
| better-sqlite3 — `docs/api.md` line 43 | Old-owner issue link | — | Discarded: redirects for real readers |
| yfinance | — | — | Excluded: Francisco already has an open PR there |

Honest note on value: this is a low-impact fix. It was chosen because it is the only candidate that passed every check in ROUTINE.md 1S without needing a judgement call from the maintainers.

## Checks required by ROUTINE.md 1S
- External PRs merged in the last 3 months: yes (#1521, 2026-11-14).
- AI policy: none; the commit carries a `Co-Authored-By: Claude` trailer, so the assistance is disclosed.
- No duplicate issue or PR: confirmed.
- Open PRs from freyesperales in this repository before today: none.
- Reproduction: 404 before, 200 after (see `test-log.txt`).
- No vulnerability was looked for or found.
