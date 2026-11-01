# Research — Experiment 088 (Sunday: maintenance lane)

Maintenance release of Gatehouse (Experiment 087), the only security tool in this repo. Scouts were not spawned and no fresh web search was run in this environment run, so the evidence below is prior knowledge of well-documented public attack classes (degraded; stated honestly).

## Why these rules (demand evidence, public classes)
- **Cache poisoning** from `pull_request_target`/`workflow_run` (shared default-branch cache scope) — documented by Adnan Khan (2024) and GitHub's own Actions security hardening guide.
- **Artifact poisoning** in `workflow_run` consumers — documented in GitHub Security Lab's "Preventing pwn requests" series and in zizmor's `artipacked`/`cache-poisoning` audits.
- **`ACTIONS_ALLOW_UNSECURE_COMMANDS`** — set-env/add-path deprecated since 2020 (CVE-2020-15228 advisory).
- **Secrets / inputs expanded into scripts** — GitHub's hardening guidance: use an intermediate environment variable.

## Shortlist (judge)
| Candidate | Use | Fresh | Feasible | Share | Total |
|---|---|---|---|---|---|
| **Gatehouse 1.1: 5 new rules + tests** | 5 | 4 | 5 | 3 | **17** |
| SARIF fingerprints / baseline file | 4 | 3 | 4 | 3 | 14 |
| New standalone tool | 3 | 3 | 3 | 3 | 12 |

## Gaps remaining
Still a line scanner; no composite-action/reusable-workflow following; no baseline (accepted-findings) file — good next maintenance item.
