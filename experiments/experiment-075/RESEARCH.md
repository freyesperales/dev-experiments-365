# Research — Experiment 075 (2026-10-16)

Six scouts (tech trends, SMB pain, devtools, documents, AI tooling, wildcard) ran in parallel. Web search was thin; evidence is mostly secondary and flagged below.

## Winner: CacheBreak (AI-tooling lane)
Demand evidence: [Claude Code cache miss costs ~12.5x a hit](https://aiweekly.co/alerts/claude-code-cache-miss-costs-125x-more-than-hit) (secondary estimate); [wmedia.es: five silent cache-invalidating actions](https://wmedia.es/en/tips/claude-code-cost-what-broke-your-cache); [LiteLLM incident: hit rate ~90% → 25–45%, only a bigger bill](https://docs.litellm.ai/blog/tags/claude-code). Gap: cost reporters (ccusage ~8k stars, burnie, cctrack, ccstat) show totals; none pinpoints the break turn and cause. Two other scouts independently pointed at agent session logs (AgentTape, Sessionbook). I checked the real log format locally (usage fields, per-block line duplication) before building.
Judge scoring (demand × shareability × repeat × feasibility, 1-10): CacheBreak 7, Unwrap 7, AgentTape 8 (crowded viewer space, evidence inferred), Hotspot 7, ChatToSheet 7 (vendor-only evidence), others ≤6. CacheBreak won on strongest cited evidence, testable ground truth, and being outside the last ten entries' themes (documents/spreadsheets/GTFS/tz).

## Shortlist that lost
- AgentTape (session replay viewer, 8) — viewer space crowded, pain inferred.
- Unwrap (paste-from-PDF un-mangler, 7) — good, but a fifth document-cleanup tool in a row.
- Hotspot (git churn treemap, 7); ChatToSheet (WhatsApp chat → orders CSV, 7, vendor-only evidence); HARmony (6); CatalogFix (6); ReportStitch (6); ContextSlice (6); Sessionbook (6); Gutter (6); Cliffdate (5, .NET 8/9 EOL 2026-11-10); Cronsight, Gloss, ContextScale, Blueprinter, LocalFit (≤5).
