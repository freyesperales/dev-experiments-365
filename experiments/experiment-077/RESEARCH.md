# Research — Experiment 077 (2026-10-18)

Six parallel scouts (tech trends, SMB pain, devtools, docs/plain language, AI tooling, wildcard). Several scouts reported blocked access to HN/Algolia and thin, vendor-authored evidence; scores are judgment, not measurement.

## Winner: OrderPaste (SMB lane)
Sellers take orders over WhatsApp and re-type them into sheets. Evidence (vendor/promo sources, so moderate): CodeWords on WhatsApp as the default ordering channel for local retailers; a Contra freelancer post (Jul 2026) on automating manual WhatsApp order tracking with n8n; Neartail’s Sheets add-on targeting the same task. Existing solutions require the paid WhatsApp Business API, n8n/Zapier or forms. Wedge: the chat export + local parsing, which also solves the privacy concern. Chosen for diversity (last ten entries were PDF/spreadsheet/CLI/audit tools), repeat use (daily), one-sentence value and a demo that fits in one screenshot.

## Shortlist that lost
| Candidate | Lane | Score | Why not |
|---|---|---|---|
| ctxweigh – `du` for agent context (AGENTS.md/skills/MCP) | tech trends | 8 | Strong trend (context-mode, claude-mem), but the series already has many agent/MCP entries; revisit later |
| toolweigh – per-tool MCP schema token cost | AI tooling | 7 | same theme saturation |
| turnburn – per-tool-call cost attribution in agent transcripts | AI tooling | 7 | same; good future graduate |
| csvdoctor – CSV health check | docs/data | 7 | overlaps SheetDiff / LocalStatement (exp 062, 064) |
| FeedLint – Merchant Center feed disapproval explainer | SMB | 6 | solid but narrower audience |
| skillpeek – preview what an agent skill repo injects | tech trends | 7 | agent theme; borderline auditor |
| hexhunt – grep for binary structs | devtools | 6 | niche audience |
| seedscrub – anonymising pg_dump | devtools | 6 | needs deep SQL parsing; privacy/security-adjacent |
| Jargonless – plain-language checker | docs | 6 | crowded, rule-catalog flavoured |
| Lifeboat – Character.AI chat rescue | wildcard | 6 | export format unverified, time-boxed |
| AnswerReady – GEO/llms.txt checker | SMB | 5 | auditor with rule catalog; crowded |
| fitgpu, altcheck, curlbook, Shutdown Exit Kit | various | 3–5 | crowded or diffuse |

Judge criteria: demand × shareability × repeat use × feasibility, with the hard rules (no auditor/linter, security de-prioritised, avoid last-10 themes). OrderPaste scored highest after those filters (7 × novelty).
