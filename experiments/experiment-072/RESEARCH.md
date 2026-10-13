# Research — Experiment 072 (2026-10-13)

Six scouts ran in parallel (tech trends, market pain, devtools, data/doc, AI/LLM tooling, wildcard). The search tool in the build environment returned little forum-level evidence, and direct page fetches (e.g. developer.chrome.com) were blocked, so **demand evidence below is secondary-source and was not independently verified by me.** Each scout flagged the same weakness.

## Winner: FeedFrock (wildcard lane)
Demand evidence (as reported by the scout, links not re-fetched):
- Chrome deprecation notice — stable removal of XSLT (`XSLTProcessor` and `<?xml-stylesheet?>` processing) dated 2026-11-17; origin trial / enterprise policy to Aug 2027: https://developer.chrome.com/docs/web-platform/deprecating-xslt (sources disagree whether that is Chrome 155 or 158)
- Migration guides: https://dev.to/mr_manushukla/chrome-removes-xslt-on-17-november-2026-audit-and-migrate-before-chrome-158-3pel , https://ecorpit.com/chrome-xslt-removal-november-2026-migration-guide/
- Podcast feed impact: https://www.podcastvideos.com/browsers-remove-xslt-support-podcast-rss-feeds/ ; LWN: https://lwn.net/Articles/1045161
- Why it wins: a hard, dated, ~5-week deadline gives urgency and shareability; the audience (bloggers, podcasters, site owners with pretty-feed themes) is large; no tool found that audits a feed and emits the replacement page + server rule; no accounts, no APIs; repeat use whenever a feed changes (CI).

## Shortlist that lost (scores = scout's own 1–10 estimate, my judge notes)
| Candidate | Lane | Score | Why not today |
|---|---|---|---|
| ctxdiet — per-section token cost of AGENTS.md/CLAUDE.md | tech/AI | 8 | Strong, but evidence was blog-grade and the ledger already skews to agent tooling; keep for later |
| CacheAutopsy — why a Claude Code turn missed the prompt cache | AI/LLM | 8 | Depends on an undocumented local log format I could not verify offline |
| DateDetective — CSV opener that explains ambiguous dates | data/doc | 7 | Crowded; recent entries (statements→CSV, sheet diff) are the same data-wrangling family |
| Plain-Words — offline plain-language checker | data/doc | 7 | Prose linter ≈ rule catalog (overused here) |
| FeedDoctor — merchant-feed fixer | market | 7 | Good, but demand sources were generic vendor guides |
| GGUF-Fit — read a GGUF header, show what fits | AI/LLM | 7 | Many near-identical calculators |
| Cronlens — cron + systemd + k8s schedules on one timeline with offset suggestions | devtools | 6 | Indirect evidence, crowded niche (Cronkit etc.); good candidate for a later run |
| WaBlast, Subtitle Surgeon, ToolTax, Envdrift Lens, Logbrush, nodeup-diff, showhn-sandbox, PowerCut | various | 5–6 | Weaker wedge or evidence |

Diversity check: the last ten ledger entries are PDF/spreadsheet/CSV/disk/WCAG utilities and spaced-repetition; none touch feeds, XML or web-platform deprecations. Not an auditor/linter: it transforms.
