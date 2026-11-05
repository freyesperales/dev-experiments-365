# Research — Experiment 090 (Thursday: detection for a public, patched CVE)

## Demand evidence
- github/advisory-database#9324 (2026-09-03): Critical Next.js advisory GHSA-2xp9-vwfh-vxw4 published 2026-08-25 but absent from the global advisory DB and OSV, API not returning it. Scanners dependent on those feeds are blind.

## Shortlist
| Candidate | Usefulness | Freshness | Feasibility | Shareability | Verdict |
|---|---|---|---|---|---|
| Next.js image-optimizer RCE lockfile checker (chosen) | 5 | 4 | 5 | 4 | primary source checked |
| CISA KEV items (Ivanti, GitLab, Cisco, N-able) | 4 | 5 | 2 | 3 | lost: needs network fingerprinting; CVE data from a search summary I could not verify against vendor advisories |
| seroval / Next.js SVG entries (Patchstack, Oct 2026) | 3 | 4 | 3 | 2 | lost: third-party summaries, details inconsistent |

Honest note: search summaries were inconsistent (one said SVG, the primary source says AVIF); only the primary advisory metadata was used. Web research was done by direct search in this run, not 3 parallel scouts.
