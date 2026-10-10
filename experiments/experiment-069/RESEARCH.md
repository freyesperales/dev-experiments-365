# Research — Experiment 069 (2026-10-10)

Six scouts ran in parallel (tech trends, SMB pain, devtools, docs/accessibility, AI tooling, wildcard). Caveat: Hacker News was unreachable from the sandbox and several scouts found mostly vendor/blog evidence, so demand evidence below is partly indirect; star scores are judgment, not data.

## Shortlist and judging
Hard rules: materially novel vs. the 64 prior entries; not an auditor/linter with a rule catalog; not security; not another PDF/spreadsheet/agent-config tool; shareable in one screenshot; repeat use; single file / no accounts.

| Candidate | Lane | Score | Verdict |
|---|---|---|---|
| **Logfold** — log template mining + good/bad log diff | devtools | 7 | **Winner**: broadest daily use (every dev/SRE), new technique (clustering) and form factor for the series, no overlap with recent entries |
| Lockdiff — human summary of lockfile diffs | devtools | 7 | Strong, but yet another "diff" tool right after ripple/SheetDiff |
| ContextDiet / CtxLint — token budget for CLAUDE.md/AGENTS.md | tech/AI | 7–8 | Freshest signal, but adjacent to the agent-config auditors the rules say are overused |
| Coldcache — per-turn prompt-cache cost timeline from Claude Code .jsonl | AI | 7 | Risk that built-in `/cost` absorbs it; AI-agent theme again |
| ClientReport — GA4/GSC CSV → client-ready report | market | 7 | Good pain, but large scope for one run |
| ExcelSafe — will Excel corrupt my CSV | docs | 7 | Spreadsheet theme just covered (ripple, SheetDiff) |
| WebMCP Bench | wildcard | 7 | Only verified fresh spike, but MCP-tool linting is the overused theme |
| FeedDoc, WaBlast Links, Llano, DocAudit, Temporal Rosetta, Cronmap, Tokenwar, Ctxhog, Restore Rehearsal | various | 5–6 | Narrower audience or weaker evidence |

## Demand evidence for Logfold
- Recurring "tool I wish existed" Ask HN threads (e.g. https://news.ycombinator.com/item?id=46345827) — comments unreadable from the sandbox, so not cited as proof.
- Log-template mining is an established research/ops technique (Drain, ICSE 2017) but ships as Python libraries (Drain3) with no UI; `lnav` needs installation; observability suites need servers/accounts. No scout found a drop-a-file, offline, diff-capable tool — unverified beyond that search.
- Generic pain: `sort | uniq -c` fails on timestamps/IDs. Logs often hold secrets/PII, so "never uploaded" is a real wedge.
