# Logfold

**Collapse a million log lines into a dozen templates — and diff a good run against a bad one. Offline, zero dependencies, nothing uploaded.**

> Built by the daily routine on 2026-10-10; published on 2026-10-22 because the push failed (GitHub access). Reconstructed from the run's own event log.

## Demo

`sort | uniq -c` is useless on logs because every line has a different timestamp, ID and number. Logfold masks the variable parts, groups lines by shape (a Drain-style template miner), and shows you what *kinds* of lines exist.

```console
$ node bin/logfold.js --demo-single --top 9
logfold  demo-bad.log  — 4,000 events → 9 templates
span     2026-10-10 14:00:00Z  →  2026-10-10 14:03:19Z

   count      %  lvl    template
    1511  37.8  INFO   INFO http <*> <*> <N> <N>ms
    1197  29.9  INFO   INFO auth User <*> logged in from <IP>
     289   7.2  ERROR  ERROR pool Connection pool exhausted (<N>/<N> in use), waiting <N>ms for a free connection
     274   6.8  WARN   WARN upstream Retry <N> for <*> after timeout
     255   6.4  DEBUG  DEBUG cache Cache <*> for key session:<UUID>
     226   5.7  INFO   INFO db Query <*> took <N>ms (<N> rows)
     182   4.5  WARN   WARN auth Failed login for <EMAIL> (attempt <N>)
      36   0.9  ERROR  ERROR http Unhandled exception in <*> TimeoutError: acquire timed out
      30   0.8  WARN   WARN feature Flag checkout_v<N> evaluated off for tenant <N>
```

Now the useful part — what changed between the healthy run and the incident:

```console
$ node bin/logfold.js --demo
logfold diff  demo-good.log  →  demo-bad.log
4 new   1 gone   5 steady

  status        A→B (per-event rate)         template
  new                0 → 289       ERROR pool Connection pool exhausted (<N>/<N> in use), waiting <N>ms for a free connection
  new                0 → 274       WARN upstream Retry <N> for <*> after timeout
  new                0 → 36        ERROR http Unhandled exception in <*> TimeoutError: acquire timed out
  new                0 → 30        WARN feature Flag checkout_v<N> evaluated off for tenant <N>
  gone              41 → 0         INFO cache Cache warmed with <N> entries in <N>ms
```

Four lines you have never seen before, ranked first. That is the whole point.

## Install / run

**Browser (no install):** open `index.html` (single self-contained file, works offline) — drop a log on **A**, optionally a second on **B** to diff, hit **Fold**. Or click **Try a demo incident**.

**CLI (Node ≥ 18, no `npm install`):**

```bash
node bin/logfold.js app.log                  # templates of one log
node bin/logfold.js good.log bad.log         # diff two logs
kubectl logs pod/api | node bin/logfold.js - # stdin
node bin/logfold.js good.log bad.log --md    # Markdown for a PR / incident doc
node bin/logfold.js good.log bad.log --json  # for scripts
node bin/logfold.js good.log bad.log --fail-on-new   # CI gate: exit 1 on a new ERROR/FATAL template
node bin/logfold.js --demo                   # built-in synthetic incident
```

Options: `--top N`, `--similarity 0..1` (merge threshold, default 0.5), `--ratio X` (spike factor, default 3). Tests: `npm test`.

## What it understands

- **Timestamps**: ISO-8601 (with zones), nginx/Apache `[10/Oct/2026:13:55:36 +0000]`, syslog, epoch s/ms, time-only. Stripped before grouping, used for the sparklines and span.
- **JSON lines**: pulls `msg`/`message`, `level`, `time`/`timestamp`; other scalar fields become `key=value` tokens.
- **Multi-line events**: stack traces and indented continuation lines fold into the event above (a log with timestamps treats every non-timestamped line as a continuation).
- **Masking**: UUIDs, IPv4/IPv6, hex ids, e-mails, file paths, numbers (`48ms` → `<N>ms`).
- **Per template**: count, %, dominant level, sparkline over time, the distribution of each variable (top values), and real example lines.
- **Diff** compares *per-event rates*, so a 10× longer log is not "10× more of everything": `new`, `gone`, `spiking` (≥3×), `dropping`, `steady`.

## Why it exists

Incident debugging starts with "what is in this log?" and "what is different from yesterday?". grep needs you to already know the answer; observability suites need servers or accounts; Drain3 and friends are Python libraries with no UI; `lnav` is a heavy install. Logfold is the missing 40 KB tool: drop a file, get the shape of it, and (since logs often contain secrets and customer data) never send it anywhere.

## Limitations

- Template mining is heuristic (fixed-depth tree, token-position similarity). Very short messages that differ in one word may merge (`server started` / `server stopped` → one template at default settings); raise `--similarity` to split more. Messages whose variable part is free text with spaces split into extra templates.
- Variable distributions track up to 200 distinct values per position, then count the rest as overflow (`200+ distinct`). Messages are capped at 80 tokens.
- Syslog timestamps carry no year; ordering is correct but absolute dates show as year 2000.
- The browser version loads the file into memory — fine for hundreds of MB on a desktop, not for multi-GB (use the CLI, which streams).
- Not a log viewer or search tool, and it does not parse binary/journald formats.

## Layout

`src/core.js` the engine (shared by CLI, browser and Web Worker) · `src/index.template.html` UI · `scripts/build.js` inlines the engine into `index.html` · `bin/logfold.js` CLI · `test/` 20 tests (a test fails if `index.html` is stale — run `npm run build`).

---
*Development Experiment 069 of dev-experiments-365* · MIT
