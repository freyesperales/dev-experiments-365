# Research — experiment 076 (2026-10-17)

Six parallel scouts (tech trends, business pain, devtools gaps, docs/accessibility, practical AI tooling, wildcard). Search quality was uneven: several scouts could not reach HN/Reddit and reported thin evidence; weak claims are marked.

## Winner: stacklens (devtools lane)
Evidence: [lazygit#2527 "Stacked PRs in lazygit"](https://github.com/jesseduffield/lazygit/issues/2527) — 43 reactions, open, updated 2026-07-27; author evaluated gh-stack, git-stack, git-branchless, Graphite and none fit. Competing tools were not freshly re-verified.

## Shortlist that lost
| Candidate | Lane | Score | Why not |
|---|---|---|---|
| temporal-shift (Date/moment→Temporal codemod) | tech | 8 | Node 26 ships Temporal, but this runtime has none, so semantic equivalence of rewrites could not be verified by running them; no fake green |
| ctxmap (context-window treemap) | AI | 8 | Agent-ecosystem theme dominates entries 1–44; token estimate is heuristic |
| OrderChat (WhatsApp export→order sheet) | business | 7 | Evidence thin/vendor-heavy; heuristic extraction hard to verify honestly |
| ctx-diet / rulebudget | tech/AI | 6–7 | Borders on the overused linter/auditor-with-rules form |
| ShipSheet, GeoFile, actions-bill | business/tech | 5–6 | Crowded or contested value |
| CaptionCut | docs | 6 | Duplicates experiment 056 (saccade) |
| ClusterArrows (diagram DSL, mingrammer/diagrams#17, 147 reactions) | devtools | 5 | Mermaid/D2 already support cluster edges |
| CSVSafe, Plain-Diff, Linewise, Docspan, Oneshot Synth, SliceDump, promptfoo-likes | various | 4–6 | Crowded or weak differentiation |

## Judge
Rules applied: novel vs. ledger (git/branch topology never covered), not an auditor with a rule catalog, no security, diverse from the last 10 (browser PDF/spreadsheet tools), single dependency-free command, fully testable offline with real git. stacklens had the only hard demand number plus a deterministic way to verify correctness.
