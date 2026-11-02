# Research — Experiment 089 (Monday: defensive tool)

Honest note: this cloud run had no web-search scouts available; the shortlist below is judged from the author's prior knowledge of the 2025–26 landscape (npm token-theft/worm campaigns, install-script abuse, dependency confusion). Links are to well-known general references, not freshly verified headlines.

## Demand evidence
- Recurring npm supply-chain incidents (self-propagating worms, hijacked maintainer tokens, typosquats) — standard advice is "review the lockfile diff and restrict install scripts", but tooling for the *diff* is thin.
- Lockfile PR diffs are routinely rubber-stamped; same-version integrity changes are invisible in review.

## Shortlist (usefulness × freshness × feasibility × shareability, /5 each)
| Candidate | U | F | Fe | S | Total |
|---|---|---|---|---|---|
| **Lockjaw — npm lockfile auditor + PR diff** | 5 | 5 | 5 | 4 | **19** |
| Security-header linter for saved `curl -I` output | 3 | 2 | 5 | 3 | 13 |
| SPF/DKIM/DMARC record linter (needs DNS for full value) | 4 | 3 | 3 | 3 | 13 |
| Dockerfile/compose hardening checker | 4 | 2 | 4 | 3 | 13 |

Existing alternatives (npm audit, Socket, lockfile-lint) either need network/accounts or only check hosts; none here combine drift, tarball/name mismatch and same-version integrity diff offline in one file.
