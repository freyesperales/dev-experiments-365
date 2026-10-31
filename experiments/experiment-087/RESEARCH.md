# Research — Experiment 087 (Saturday: maintenance lane → small Monday-type tool)

No existing tool of Francisco's lives in this repo, so per ROUTINE.md the fallback is a small defensive tool.
Research was a single web search plus prior knowledge (scouts not spawned; degraded, noted in report).

## Demand evidence
- Cloud Security Alliance note on the *prt-scan* campaign (Apr 2026): AI-assisted mass exploitation of `pull_request_target`; follows *hackerbot-claw* (Feb 2026). https://labs.cloudsecurityalliance.org/research/csa-research-note-github-actions-prt-scan-supply-chain-2026/
- Secondary reports (Jan/Jun 2026) of ~38% of workflows exposed to script injection/unsafe triggers — treat as unverified.
- Ultralytics (Dec 2024) branch-name injection; tj-actions/changed-files (2025) tag repointing.

## Shortlist
| Candidate | Use | Fresh | Feasible | Share | Total |
|---|---|---|---|---|---|
| **Gatehouse** (Actions workflow auditor) | 5 | 5 | 5 | 4 | **19** |
| .env / secrets-in-repo checker | 4 | 3 | 5 | 3 | 15 (overlaps leakradar) |
| Security-headers grader | 3 | 2 | 5 | 3 | 13 (saturated) |

## Existing tools & gaps
zizmor (Rust, excellent, needs install), actionlint (correctness more than security), poutine/StepSecurity (heavier). Gap: zero-install, auditable single file.
