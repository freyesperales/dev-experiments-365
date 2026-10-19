# Research — Experiment 078 (2026-10-19)

Six parallel scouts; evidence quality was mixed (several fetches failed; noted per candidate). Winner: **cronwise**.

## Demand evidence for the winner
- Argo Workflows docs describe cron runs happening once, twice or zero times across DST: https://argo-workflows.readthedocs.io/en/release-3.5/cron-workflows/
- Kubernetes CronJob uses the controller's time zone unless `.spec.timeZone` is set; GitHub Actions cron is UTC-only (platform docs).
- dev.to guide on timezone issues in cron jobs: https://dev.to/cronmonitor/handling-timezone-issues-in-cron-jobs-2025-guide-52ii ; https://itime.day/articles/why-cron-job-runs-at-wrong-time
- Gap: crontab.guru explains syntax but does not simulate time zones/DST.
- Single-file "HTML tools" listed at Assess on the Thoughtworks Radar (Apr 2026); generic JSON/JWT/regex utilities are saturated.

## Shortlist (score = judge's demand × shareability × repeat use × feasibility, /10)
| Candidate | Lane | Score | Why not |
|---|---|---|---|
| **cronwise** — DST-aware cron simulator | devtools | 7 | **winner**: documented real gap, exactly testable, repeat use, distinct from recent file-converter tools |
| ctxmap/ctxpack — repo token-cost treemap | tech/AI | 7 | AI-session/context tooling is a crowded wave (repomix etc.); approximate tokenizer weakens claims |
| ClientReport — GSC CSV → client report | market | 7 | good, but evidence mostly vendor content; heavy reporting UX for one run |
| agentscape — session as generated city | wildcard | 7 | replay/visualizer space saturated (claude-replay, zoetrope, etc.) |
| carrycost — cost per tool result | AI | 6 | ccusage family crowded |
| WaBlast — CSV → wa.me send queue | market | 6 | niche, existing Sheets add-ons |
| Plain-Rewrite Diff | docs | 6 | weak evidence |
| altwiz — alt-text filler for docx/pptx | docs | 6 | zip round-trip risk |
| evalfile — local model comparison | AI | 6 | eval harnesses crowded |
| sketchmap — hand-drawn repo map | wildcard | 6 | mermaid/madge competition |
| FeedFix, cachebreak, tinyserve, tokenrain, Easy-Read Maker, tzmeet-dev, agentlog | various | 4–5 | lower star potential / weak evidence |
