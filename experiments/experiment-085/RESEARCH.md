# Research — Experiment 085 (2026-10-29)

Six parallel scouts (tech trends, market pain, devtools, docs/a11y, AI tooling, wildcard). Caveat: web access was thin (news.ycombinator.com unreachable; search returned mostly vendor pages and guides), so demand evidence below is *indirect* (guides, competing tools, marketplace gigs), not first-hand complaint threads. Scores are the scouts' own, adjusted by the judge for diversity against the last ~10 entries.

## Winner: Detour (scouted as "RedirectRoulette", market-pain lane)
- Problem: agencies, freelancers and in-house SEOs doing replatforms match thousands of old URLs by hand.
- Evidence: urllo's redirect-mapping guide ("staring at a list of thousands of old URLs... feels like the task will never be completed", urllo.com/resources/learn/redirect-mapping-guide-migrations); eseospace on chains from consolidating URLs (eseospace.com/blog/301-redirect-map-website-migration/); a cluster of single-purpose generators (Webflow 301 builder on IndieHackers, pixelkicks, bushe.co) and a paid Apify validator — many small tools = real demand, no complete one.
- Gap: each tool is one platform, or only formats pairs you already matched, or needs network/signup.
- Why it won: new lane (business pain / SEO, matching algorithm) vs. the last ten (CSV safety, billing, Caddy, HAR, cron, subtitles, git treemap...); repeat use (every migration, plus `check` for existing maps and `--strict` in CI); value obvious in one screenshot.

## Shortlist that lost
| Idea | Lane | Score | Why not |
|---|---|---|---|
| SkillWeight/TokenWeigh — per-turn token cost of CLAUDE.md/AGENTS.md/skills/MCP schemas | tech trends + AI | 7-8 | Strongest trend signal (10 of 11 weekly-trending repos are agent skills), but same agent-context theme the series has mined for 40+ entries, and CacheBreak (075) is adjacent. Good candidate for a future run. |
| Localeforge — plural-aware translation workbench | docs | 7 | Crowded (SimpleLocalize linter, i18next-json-sync, chki18n); close to linter territory. |
| Evalmigrate — OpenAI Evals/Agent Builder export → portable files | wildcard | 6 | Deadline-driven (reported read-only 31 Oct, shutdown 30 Nov 2026) but export schema unverified and the spike fades fast. |
| Tzfix — ICS merge and timezone repair | docs | 6 | Niche audience. |
| AltDeck — offline EPUB/HTML alt-text editor | a11y | 6 | Needs hand-written zip read/write; niche. |
| ShelfSheet — CSV to shelf tags + barcodes | market | 6 | Useful, less viral. |
| Matrixwise — GitHub Actions matrix expander | devtools | 6 | Needs a YAML-subset parser; dev-ops theme heavily covered. |
| TokenWeigh/AgentsMD Lens, SchemaSieve, Modelsunset, Toolchanger Planner, FeedDoctor, envmap, lockglance, RedirectRoulette-adjacent others | various | 4-6 | Overlap with prior themes, linter-with-catalog risk, or crowded space. |

## Judge notes
Hard rules applied: not an auditor/linter with a rule catalog (Detour synthesises a map and exports it), no security angle, no accounts/paid APIs, single offline file plus zero-dep CLI. Degraded: no first-hand forum evidence, platform syntax verified from memory/docs only (flagged in README Limitations).
