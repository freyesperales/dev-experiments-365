# cronwise

**Type a cron schedule and a time zone — see what it *actually* fires, including the runs DST silently skips or doubles.**

> Built by the daily routine on 2026-10-19; published on 2026-10-22 because the push failed (GitHub access). Reconstructed from the run's own event log.

```
$ node cli.js "30 2 * * *" --tz America/New_York --hazards
30 2 * * *  [vixie]  zone=America/New_York  policy=strict
  1  2027-03-14 02:30:00  (never)   <-- SKIPPED — this wall-clock time does not exist that day

$ node cli.js "30 1 * * *" --tz America/New_York --from 2026-10-31T00:00:00Z --count 4 --also UTC
30 1 * * *  [vixie]  zone=America/New_York  policy=strict
  1  2026-10-31 01:30:00 -04:00  = 2026-10-31T05:30:00Z  UTC: 2026-10-31 05:30:00 +00:00
  2  2026-11-01 01:30:00 -04:00  = 2026-11-01T05:30:00Z  UTC: 2026-11-01 05:30:00 +00:00   <-- RUNS TWICE (1st) — wall time happens twice
  3  2026-11-01 01:30:00 -05:00  = 2026-11-01T06:30:00Z  UTC: 2026-11-01 06:30:00 +00:00   <-- RUNS TWICE (2nd) — wall time happens twice
  4  2026-11-02 01:30:00 -05:00  = 2026-11-02T06:30:00Z  UTC: 2026-11-02 06:30:00 +00:00
```

Your 02:30 nightly job **never runs** on 14 Mar 2027; your 01:30 job **runs twice** on 1 Nov 2026. crontab.guru can't tell you that. cronwise can.

## Run it

- **Web (zero install):** open `index.html` in any browser. One file, offline, nothing uploaded. Presets, per-fire multi-zone view, a "DST hazards, next 2 years" panel, shareable URL hash.
- **CLI (Node ≥ 18, no dependencies):** `node cli.js "<expr>" --tz Europe/London [--dialect vixie|k8s|quartz|eventbridge] [--policy strict|once] [--count 10] [--from ISO] [--hazards] [--also UTC,Asia/Tokyo] [--json]`. With `--hazards` the exit code is 1 when hazards exist, so it works as a CI gate.
- **Tests:** `npm test` (or `node --test test/test.js`). **Rebuild the HTML:** `npm run build`.

## Why it exists

Jobs scheduled in local time hit two DST edge cases a year: the wall-clock time that doesn't exist (spring forward) and the one that happens twice (fall back). Schedulers disagree about what to do, and syntax explainers don't model either. cronwise enumerates real instants with the browser/Node time-zone database and labels each slot: `SKIPPED`, `SHIFTED`, `RUNS TWICE`, `RUNS ONCE`. Half-hour DST (Lord Howe) is handled.

## What it models

| Dialect | Notes |
|---|---|
| `vixie` / `k8s` | 5 fields, names, `@daily`-style macros, day-of-month OR day-of-week when both are restricted |
| `quartz` | 6–7 fields (seconds first, optional year), `?`, `L`, `L-n`, `LW`, `nW`, `nL`, `n#k` |
| `eventbridge` | 6 fields, year required, `?` rule |

Two DST policies: **strict** (missing time never fires, repeated time fires twice) and **once** (Vixie-style for fixed-time jobs: missing time fires at the moment of the jump, repeated time fires once). Jobs with a wildcard hour/minute (`0 * * * *`) follow real elapsed time and are reported as hazard-free.

## Limitations (honest)

- The two policies are **models**, not a guarantee about your scheduler. Vixie/cronie behaviour follows its man page; Kubernetes, Quartz, EventBridge and others may differ by version. Verify against your platform's docs before relying on a label.
- Hazard detection is for fixed-time jobs (hour and minute not `*`-led); seconds-level wildcards in Quartz are not treated as hazards.
- Quartz/EventBridge parsing covers the common grammar; exotic forms (wrap-around ranges like `FRI-MON`, `#` combined with lists of ranges) are rejected with an error rather than guessed.
- Depends on the runtime's IANA tz data; very old Node/browsers may lack zones. Searches look ahead a bounded number of days.
- Not a scheduler, and it does not read your crontab files.

## Sample run / verification

Test suite (Node v22.17.0): # tests 13 # pass 13 # fail 0 

Development Experiment 078 of dev-experiments-365
