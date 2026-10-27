# Research: Unbilled (2026-10-27)

Six scouts ran in parallel (tech trends, SMB pain, devtools, docs/accessibility, practical AI, wildcard). Their search tools were weak: evidence below is mostly secondary or vendor sources, so treat the statistics as directional.

## Winner: Unbilled (freelancer/agency lane)
Demand evidence (from the SMB scout):
- Breeze agency statistics: 78% of agencies rarely or only sometimes charge for out-of-scope work. https://www.breeze.pm/articles/agency-project-management-statistics
- Agiled: agencies lose about 20% of revenue to billable-hour leakage (vendor claim). https://agiled.app/hub/agencies/billable-hours-leak
- DEV Community: 67% of freelancers absorb scope creep (secondary). https://dev.to/wilsonhoe/67-of-freelancers-absorb-scope-creep-on-every-project-and-its-costing-them-7800year-in-29d1

Wedge: trackers (Rize, Everhour, Toggl, Harvest) record hours; scope tools (ScopeGuard, Scopzi) handle change requests. None audits an existing export against retainer, scope and invoices locally and offline.
Why chosen: new lane and form for this repo (the last ten entries were devtools, CSV safety, log/HAR viewers), concrete CSV in/out, monthly repeat use, a shareable "money recovered" number, no accounts or paid APIs.

## Shortlist that lost (scout scores 1-10)
| Idea | Lane | Score | Why not |
|---|---|---|---|
| PayoutMatch (Shopify orders vs payouts) | SMB | 6 | Needs real Shopify export schemas I could not verify; overlaps SheetDiff/LocalStatement |
| AIReady Page (GEO checker) | SMB | 5 | Weakest evidence; auditor-shaped, which the rules discourage |
| PreambleTax / ctxweigh (CLAUDE.md token cost) | AI + tech (two scouts) | 7 | Same theme as CacheBreak (exp 075); approximate tokenizer |
| FitCheck | AI | 5 | Overlaps gguf-xray (exp 071) |
| PromptDiffBoard | AI | 6 | Good, but eval tooling is crowded |
| actionsbill (Actions minutes cost) | tech | 6 | Narrow; billing rules move |
| Temporal Rosetta | tech | 6 | Regex conversion misses real code |
| TableTamer (paste-and-fix tables, accessible HTML) | docs | 6 | Strong runner-up; close to recent CSV/SheetDiff work |
| Pagebreak, AltDraft | docs | 5 | Small niches |
| SessionScope | devtools | 7 | Crowded (ccusage, claude-replay, burnie); formats change |
| PatchPeek, PortPeek | devtools | 6 / 5 | Lower demand evidence |
| DeadlineDeck (sunset-date calendar) | wildcard | 6 | Value depends on hand-curated data I could not verify today |
| EvalsExit | wildcard | 5 | Niche and 4 days from the deadline; export schema unverified |
| Year-End Money Dates | wildcard | 3 | Generic |
