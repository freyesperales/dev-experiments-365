# Research — Experiment 070 (2026-10-11)

Six parallel scouts (tech trends, market pain, devtools, data/docs, AI tooling, wildcard). Caveat: several scouts could not reach news.ycombinator.com and relied on search snippets; evidence quality is noted per row. A judge pass scored the shortlist against the hard rules: novel vs the 64 prior entries, diversity (no auditor/linter, no security, not another spreadsheet/PDF/agent-config tool), shareability, repeat use, zero-friction, buildable comprehensively in one run.

## Winner: Hashboard
- Demand: *Bigwords.page — "turn any screen into a sign, the URL is the app"* hit ≈296 points / 97 comments on Show HN and the front page on 2026-10-08 ([mirror](https://zeli.app/story/49994443), [coverage](https://bestcadpapers.com/software-qa-development/show-hn-bigwords-page-turn-any-screen-into-a-sign-the-url-is-the-app/)). Thoughtworks Radar (Apr 2026) lists "HTML tools" as a technique ([Radar](https://www.thoughtworks.com/es-cl/radar/techniques/html-tools)).
- Gap: Bigwords is text/slides only. No interactive state (tap scores, queue counters, running timers), no QR hand-off, no kiosk wake lock.
- Fit: the series' first *live-display / signage* form factor; deliberately not an auditor; no secrets, no network.

## Shortlist (score = demand × shareability × repeat use × feasibility, 1–10, scouts' estimates adjusted by judge)
| # | Candidate | Lane | Score | Why it lost |
|---|---|---|---|---|
| ✔ | **Hashboard** — URL-as-app signs/scoreboards/queues/timers | wildcard | 8 | winner: freshest verified spike, novel form factor, high repeat use |
| 2 | tracewright — drop an agent session log, get a costed timeline | tech trends | 7 | agent-tooling is the dominant theme of recent entries; evidence was trend-adjacent, not direct |
| 3 | llama-line — hardware+model → tested llama-server command | AI tooling | 6.5 | memory math is saturated by VRAM calculators; model-architecture table needs data I can't verify offline |
| 4 | ctx-diet — CLAUDE.md/AGENTS.md token budgeting | AI tooling | 6 | overlaps earlier agent-config entries; sources were secondary blogs |
| 5 | Mojibake Doctor — find the wrong decode behind garbled CSV | data/docs | 6.5 | strong evidence, but yet another CSV/spreadsheet utility after #046, 054, 060–064 |
| 6 | PhoneScrub — WhatsApp-ready E.164 contact lists | market | 6 | needs a country-rule table I can't verify; XLSX parsing would inflate scope |
| 7 | logweave — merged multi-file log timeline in the browser | devtools | 6.5 | good gap but no demand evidence beyond tool landscape; runner-up |
| 8 | Emulsion — film-stock emulation lab | wildcard | 5.5 | weak HN spike (5 points) |
| 9 | GSC Monthly — Search Console report builder | market | 5.5 | AI-report CSV layout unverified |
| 10 | spanless / HARdiff / FeedMender / hypercut / Ridgeline / will-it-run / Easy-Read Studio / promptbench-lite | various | ≤6 | crowded space, niche, or thin evidence |

Next-run seeds: **logweave** and **Mojibake Doctor** both have clear gaps and would be good future builds.
