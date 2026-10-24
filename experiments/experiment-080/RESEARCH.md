# Research — Development Experiment 080 (2026-10-24)

Six parallel scouts, one lane each. **Caveat:** the sandbox's web access was thin (HN/Algolia/Reddit unreachable, mostly vendor and blog pages), so demand evidence is *indicative*, not measured. Star scores are judgments.

## Why HARbor won
HAR files are what support teams, QA and browser DevTools hand around, and they routinely contain live `Authorization` headers, cookies, JWTs and card/password fields. People hesitate to paste them into hosted viewers, and the converters that exist (HAR→curl) give no overview. Evidence the gap is real: the scout found only converters and libraries — [har-to-curl](https://bushe.co/tools/har-to-curl-converter/), [har2code](https://github.com/lisoboss/har2code), [curl-to-har](https://github.com/yosriady/curl-to-har) — and a browser extension ([API Inspector](https://addons.mozilla.org/de/firefox/addon/api-inspector-network-viewer/)), not a portable offline file; single-file offline HTML tools are an active trend ([EdgeMD Viewer](https://localhtmltools.lachlanallison.com/tool/edge-md-viewer/), [dev.to offline tool post](https://dev.to/christian_chry_d2a29365/i-built-a-simple-offline-html-tool-to-manage-freelance-work-no-saas-no-login-240k)). Not verified: whether other offline viewers exist — check before claiming uniqueness.

Differentiators built: waterfall + filter query language, copy-as-curl, **redaction that is re-scanned after the fact**, and **diff of two captures** (before/after a deploy) with regression flags and a CI exit code.

## Shortlist that lost
| Candidate | Lane | Why not |
|---|---|---|
| CSV Rosetta (fix CSV encoding/delimiter for Excel) | data/docs | Good pain, strong second. Overlaps the series' encoding/mojibake work (Cuepoint, 079). |
| FeedDoctor (Merchant Center feed rules) | SMB | A rule-catalog checker — explicitly overused here. |
| AgentReady (GEO/llms.txt readiness) | SMB | Rule-catalog checker; scout itself notes llms.txt impact is unproven. |
| PreTurn / ContextDiet (token cost of CLAUDE.md, MCP, skills) | AI / trends | Strongest blog evidence, but adjacent to loadout (006) and CacheBreak (075). Best candidate for a later run. |
| ContrastPair (`contrast-color()` vs WCAG/APCA) | wildcard | Close to contrast-fix (063). |
| ScopeLint (modern-CSS suggestions) | wildcard | Rule-catalog linter. |
| EvalLite, TemplateLens, AltGap, ICS Tidy, UTM Guard, noisediff, AgentHandoff, SingleFile Diet, HTMLtoFrames | various | Lower score (weak evidence, crowded space, niche, or heavy interpreter). |

Scores (demand × shareability × repeat use × feasibility, 1–10): HARbor 7, CSV Rosetta 7, FeedDoctor 7, AgentReady 7, PreTurn 7, ContextDiet 7, ContrastPair 6, others ≤6. Tiebreak: novelty vs the last ten entries (a *viewer/workbench* with a privacy angle, not a checker), repeat use (every bug report and perf investigation produces a HAR), and diversity of form factor.
