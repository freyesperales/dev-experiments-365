# CacheBreak

**Drop in a Claude Code session log and see the exact turn where your prompt cache broke, what changed, and what it cost.**

> Built by the daily routine on 2026-10-16; published on 2026-10-22 because the push failed (GitHub access). Reconstructed from the run's own event log.

```
cachebreak · planted.jsonl
15 turns · hit rate 67.7% · est. cost $0.85 · wasted on breaks $0.64

  █ cache read  ▒ cache write  ░ uncached input

  1 ██████████████████████████████▒▒
  2 ████████████████████████████████▒▒░
  3 ███████████████████████████████████▒▒
  4 ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  ◄ BREAK model-switch
  5 ████████████████████████████████████████▒▒
  6 ██████████████████████████████████████████▒▒░
  7 ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  ◄ BREAK ttl-expiry
  8 ████████████████████████████████████████████████▒▒
  9 ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  ◄ BREAK compaction
 10 █████████████████▒▒░
 11 ████████████████████▒▒
 12 ████████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  ◄ BREAK prefix-change
 13 █████████████████████████▒▒░
 14 █████████████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  ◄ BREAK unexplained
 15 ██████████████████████████████▒▒░
...
BREAK at turn 4: 22,506 of 22,506 prefix tokens re-billed (~$0.39)
  prefix diverged at the very start of the prompt (system prompt / tool definitions)
  - [high] model-switch: claude-sonnet-5-5 → claude-opus-5-5 (cache is per-model)
BREAK at turn 12: 8,506 of 13,506 prefix tokens re-billed (~$0.03)
  prefix diverged at ≈ token 5,000 of 13,506
  - [medium] prefix-change: tool set changed
```

## Run it

- **Browser (no install):** open `index.html` (one self-contained file, works offline, nothing uploaded), drop a session `.jsonl` from `~/.claude/projects/<project>/`. Append `#sample` to the URL for a demo.
- **CLI (Node 18+, zero dependencies):** `node cachebreak.js` analyses your newest session; or `node cachebreak.js session.jsonl [--json|--md] [--min-lost=2000] [--prices=prices.json]`.
- **Tests:** `npm test`.

## Why it exists

A cache read costs about a tenth of fresh input; a cache miss on a long session can cost an order of magnitude more for that turn, and nothing in the UI tells you. Causes are silent: switching model, an idle gap past the cache TTL, a compaction, a toggled tool/MCP server, a client or gateway upgrade (a LiteLLM release dropped hit rates from ~90% to 25–45% with no error). Existing tools (ccusage and friends) report totals per day or session; none says *which turn* broke the cache or *why*. See RESEARCH.md.

## How it works

Claude Code logs one JSONL line per content block, each repeating the turn's `usage`; CacheBreak de-duplicates by `message.id`. A turn is a **break** when the previous turn's whole prompt should have been a cache hit but this turn read back less than 80% of it (and ≥2,000 tokens were lost). Because a cache read stops at the first changed token, `cache_read_input_tokens` also tells you roughly **where the prefix diverged** — near 0 means the system prompt/tool definitions changed; later means the conversation body did. Causes are ranked evidence: model switch, TTL expiry (5 min, or 1 h when the previous turn wrote 1 h cache), compaction, tool/MCP/skill-list attachments, client version change, else *unexplained*. Wasted dollars = lost tokens × (cache-write − cache-read price).

## Limitations

- Prices are **illustrative defaults** (editable); your plan or gateway may differ. Costs are estimates from logged `usage`, not invoices.
- Cause attribution is heuristic. "Unexplained" is a real answer: the log has no signal for upstream edits (CLAUDE.md, system prompt) or server-side eviction. The prefix-change cause is *medium* confidence because those attachments usually append rather than break the prefix.
- Built against the Claude Code JSONL shape as of Oct 2026; other agents' formats are not parsed. Sub-agent (sidechain) turns are counted separately and excluded from the main thread.
- Verified against synthetic sessions with planted breaks and the real log structure, not a large corpus of real incidents.

## Sample run (this repo, `node cachebreak.js fixtures/planted.jsonl`)

```
cachebreak · planted.jsonl
15 turns · hit rate 67.7% · est. cost $0.85 · wasted on breaks $0.64

  █ cache read  ▒ cache write  ░ uncached input

  1 ██████████████████████████████▒▒
  2 ████████████████████████████████▒▒░
  3 ███████████████████████████████████▒▒
  4 ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  ◄ BREAK model-switch
  5 ████████████████████████████████████████▒▒
  6 ██████████████████████████████████████████▒▒░
  7 ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  ◄ BREAK ttl-expiry
  8 ████████████████████████████████████████████████▒▒
  9 ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  ◄ BREAK compaction
 10 █████████████████▒▒░
 11 ████████████████████▒▒
 12 ████████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  ◄ BREAK prefix-change
 13 █████████████████████████▒▒░
 14 █████████████▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒  ◄ BREAK unexplained
 15 ██████████████████████████████▒▒░

BREAK at turn 4: 22,506 of 22,506 prefix tokens re-billed (~$0.39)
  prefix diverged at the very start of the prompt (system prompt / tool definitions)
  - [high] model-switch: claude-sonnet-5-5 → claude-opus-5-5 (cache is per-model)

BREAK at turn 7: 27,015 of 27,015 prefix tokens re-billed (~$0.09)
  prefix diverged at the very start of the prompt (system prompt / tool definitions)
  - [high] ttl-expiry: idle 15 min > 5 min cache TTL

BREAK at turn 9: 30,021 of 30,021 prefix tokens re-billed (~$0.10)
  prefix diverged at the very start of the prompt (system prompt / tool definitions)
  - [high] compaction: conversation compacted

BREAK at turn 12: 8,506 of 13,506 prefix tokens re-billed (~$0.03)
  prefix diverged at ≈ token 5,000 of 13,506
  - [medium] prefix-change: tool set changed

BREAK at turn 14: 8,512 of 16,512 prefix tokens re-billed (~$0.03)
  prefix diverged at ≈ token 8,000 of 16,512
  - [low] unexplained: no model/TTL/compaction/client signal in the log — prefix edited upstream (system prompt, tool schemas, CLAUDE.md) or server-side eviction
```

Tests: # tests 12 # pass 12 # fail 0 (12 tests, ground-truth planted breaks asserted).

---
Development Experiment 075 of dev-experiments-365
