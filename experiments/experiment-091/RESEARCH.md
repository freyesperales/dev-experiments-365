# Research — Experiment 091

**Honesty note:** this run had no web access for parallel scouts; the demand evidence below is from established, well-documented classes of issues (OWASP API Security Top 10, widely taught), not from a live this-week scrape. No claim is made about a specific incident this week.

## Demand
- OWASP API Security Top 10 (2023) ranks **API1 Broken Object Level Authorization**, **API3 Broken Object Property Level Authorization** (mass assignment), **API2 Broken Authentication** (JWT misuse) and **API7 SSRF** among the top API risks — all four are in this lab.
- Defenders/learners repeatedly ask for a *small, runnable* API to practise these; big labs (Juice Shop, crAPI) need Docker/heavy setups.

## Shortlist (Friday = hands-on lab)
| Candidate | Usefulness | Freshness | Feasibility | Shareability | Total |
|---|---|---|---|---|---|
| **LEDGERLEAK — 4-bug API authz lab (JWT none, BOLA, SSRF, mass assignment)** | 5 | 3 | 5 | 4 | **17** |
| Prompt-injection RAG lab | 4 | 5 | 3 | 4 | 16 (TOOLTRAP already covered agent security; theme too close) |
| Race-condition coupon lab | 3 | 2 | 4 | 3 | 12 |

## Why existing options fall short
Juice Shop / crAPI / DVWA are large, need Docker or a DB, and bury each bug. This lab is zero-dependency Node, ~200 lines, each bug has a switchable fix and a test proving it.
