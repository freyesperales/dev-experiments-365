# Research — Experiment 067

Date: 2026-10-08. Six parallel scouts (tech trends, business pain, devtools, doc/a11y, AI tooling, wildcard).
**Honesty note:** web access was thin — scouts mostly saw search snippets, no page bodies, and several
dates are unverified. Evidence below is directional. Items marked (unverified) come from model knowledge.

## Hard-rule filter (ROUTINE §2)
Last ~10 ledger entries: PDF redaction, dev-disk reclaimer, bank-statement PDF→CSV, contrast fixer, spreadsheet diff,
subtitle segmentation, tz-database engine, binary-format inference… plus a long tail of MCP/agent auditors.
Excluded up front: anything that is an auditor/linter with a rule catalog, security, PDF/spreadsheet/contrast/disk.
That removed the "AGENTS.md/skill linters" flavour of the AI-lane candidates (ctxcost / skillpack / ctxbill risk being read as checkers, and MCP-adjacent work is the dominant theme of the repo).

## Shortlist and scores (demand × shareability × repeat-use × feasibility, 1-10 each → product-ish, normalised /10)
| # | Candidate | Lane | Demand | Share | Repeat | Feasible | Verdict |
|---|-----------|------|--------|-------|--------|----------|---------|
| 1 | **chatorder** — WhatsApp order chat → order sheet, pick list, invoices | business | 8 | 8 | 9 | 8 | **WINNER (7.9)** |
| 2 | alt-sweep — bulk alt-text for .docx/.pptx | a11y | 7 | 6 | 5 | 5 (needs OOXML re-zip) | runner-up 5.8 |
| 3 | agentdiff-lite — annotate a diff, copy as agent prompt | devtools | 6 | 8 | 7 | 8 | 7.2, but AI-agent-adjacent; loses on diversity |
| 4 | ctxbill — per-MCP-server token cost | AI | 7 | 7 | 5 | 8 | MCP theme overused |
| 5 | GapLab — CSS gap-decorations playground | wildcard | 5 | 6 | 4 | 9 | 6.0, niche (Chrome 149 only) |
| 6 | feedfix — Merchant Center feed bulk fixer | business | 6 | 4 | 6 | 7 | spreadsheet-ish, niche |
| 7 | shellrewind, vramfit-cli, promptdiff-eval, WebMCP Probe, plainfix, captionfix, ci-here, Canvas Lift, agentsync, agent-recap | misc | ≤6 | | | | not picked |

## Why chatorder won
* Clearest underserved user: micro-sellers who take orders over WhatsApp (bakeries, honey, produce, resellers),
  huge in LATAM/India/Africa. Evidence (snippet-level, unverified dates):
  * Indie Hackers build log — seller's spouse sold honey over WhatsApp, tracked in "horrible" spreadsheets, every app found was a sales-team CRM — https://www.indiehackers.com/product/order-hand
  * "5 orders/day is fine, 50 becomes a full-time job" — https://codewords.ai/blog/how-to-automate-whatsapp-order-processing
  * Existing automation needs WhatsApp Business API / Twilio / n8n — i.e. accounts, money, setup.
* Wedge: works on the plain **"Export chat" .txt** every phone can produce; no account, no API, nothing uploaded.
* Repeat use: daily/weekly (paste today's chat, get today's pick list + invoices).
* Visible in one screenshot: messy chat on the left, tidy per-customer orders + production totals on the right.
* Diversity: first conversational-text parser in the series; non-security; business lane; no PDF/spreadsheet/audit theme.
