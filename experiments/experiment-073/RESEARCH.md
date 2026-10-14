# Research — Experiment 073

Date: 2026-10-14. Six parallel scouts (tech trends, market pain, devtools, docs/plain language, AI tooling, wildcard). Evidence quality was moderate: several scouts could not reach HN/Reddit and relied on vendor pages; this is stated where it matters.

## Winner: Plainly (plain-language workbench)
- Demand: Zurich built "Sprache vereinfachen" using the open ZIX index (listed in the Swiss open-source catalogue, opensource.admin.ch); commercial capito sells the same need; the EU Accessibility Act raises pressure on public and commercial text; a 2026 project (readlevel) argues for local-only readability checking.
- Gap: Hemingway is closed; npm readability-checker only returns a Flesch score; Zurich/capito are LLM/account based; Eclipse Readability Studio is a heavy desktop app. No open, offline, multilingual tool says *which sentence* and *which word to swap*.
- Why chosen: only candidate in a fresh lane (writing/accessibility for non-developers), repeat use (every letter or page), obvious in one screenshot, single file, no secrets. Recent entries are dominated by diff/audit tools and agent-ecosystem tools, which the routine rules forbid repeating.

## Shortlist that lost
| Candidate | Lane | Score | Why not |
|---|---|---|---|
| SkillShift (convert SKILL.md/AGENTS.md/.cursor rules) | tech trends | 8 | Agent-ecosystem theme is the series' dominant theme; moves with vendor spec churn |
| HARdiff (diff two HAR captures) | devtools | 7 | Another "diff" tool right after SheetDiff/ripple/gnomon; kept as a strong future candidate |
| TemplateTap (render GGUF chat templates) | AI tooling | 7 | Needs a jinja subset; evidence indirect; risk of low fidelity vs real engines |
| Vault Lifeboat (Bitwarden export converter) | wildcard | 7 | Password data invites trust/security scrutiny; story rests on secondary reports |
| TemporalShift (Date → Temporal translator) | tech trends | 7 | Narrow audience |
| ContextBudget / ContextLedger | AI tooling | 6-7 | Crowded cost-viewer space; approximate tokenizer |
| FeedDoctor (Google Shopping feed fixer) | market | 6 | Overlaps "linter with rule catalog" form |
| PayoutMatch, Lockfile Lens, Blueprint Bridge, UTM Guard, AltSweep, TableTidy, EvalSheet, PlanDiff | various | 5-6.5 | Narrower audience or crowded |

Candidate evidence links are those returned by the scouts (Zurich ZIX catalogue, capito.eu, readlevel, npm readability-checker); they were not all independently re-opened.
