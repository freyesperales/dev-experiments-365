# Research — Development Experiment 081 (2026-10-25)

Six parallel scouts ran (tech trends, SMB pain, devtools, data/docs/a11y, practical AI tooling, wildcard).
Caveat, stated honestly: HN, Algolia and Product Hunt were unreachable from the scouts' network and web search
surfaced few primary threads, so demand evidence is mostly indirect (docs, forum threads, repo issues).

## Shortlist and judge scores
Hard rules: materially novel vs 80 prior entries; not an auditor/linter with a rule catalog; not security; low friction; repeat use.

| Candidate | Lane | Scout score | Judge verdict |
|---|---|---|---|
| **Caddify** — nginx.conf → Caddyfile translator with a "couldn't translate, here is why" report | devtools | 7 | **WINNER**: a translator (not an auditor), new domain (web-server config), visible before/after, evidence of repeated hand-migration requests |
| SkillScale — token cost of installed agent skills | tech trends | 8 | Rejected: skill-adjacent to #3 skill-collider / #6 loadout, evidence is issue-tracker only |
| FeedDoctor — product CSV → Merchant Center fix list | SMB | 7 | Rejected: a rule-catalog validator (banned pattern) |
| DocxLint — offline Word accessibility checker | docs/a11y | 7 | Rejected: linter with a rule catalog |
| XSLTaph — bake XSLT feeds to HTML | wildcard | 7 | Rejected: duplicates #72 FeedFrock |
| ctxdiet — per-line token budget for CLAUDE.md | AI | 7 | Rejected: auditor-shaped, crowded |
| burnmap — agent session cost flame graph | AI | 6 | Rejected: crowded, overlaps #75 CacheBreak |
| Addressmith — ISO 20022 address fixer | wildcard | 6 | Rejected: niche, heuristics not trustworthy enough |
| ReportStitch, ComposeProbe, ScrubDoc, ClashBoard, promptpit, envsync, BotGate, TermTable, FrameCheck, Cores Report | various | 3–6.5 | Lower scores / crowded / weak evidence |

## Demand evidence for the winner (from the devtools scout; not independently re-verified)
- Caddy's own nginx adapter is explicitly incomplete: https://github.com/caddyserver/nginx-adapter
- Recurring "please translate my nginx config" threads: https://caddy.community/t/help-migrating-nginx-to-caddy/25247 ,
  https://caddy.community/t/nginx-config-translation-help/8166 , manual tutorial https://caddy.community/t/tutorial-convert-a-nginx-conf-to-caddy-config/18853
- Migration write-up reporting a ~75% shrink: https://t27duck.com/posts/16-migrating-from-nginx-to-caddy

## Wedge
The official adapter is an unfinished Go plugin that silently drops what it cannot express. Caddify runs anywhere
(one HTML file, or `node cli.js`), and treats the *untranslatable remainder* as the product: every skipped or
approximated directive is listed with its line, the reason, and the Caddy-side suggestion.
