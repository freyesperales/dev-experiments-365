# Hashboard

**Full-screen signs, scoreboards, queue numbers, countdowns and timers where the URL *is* the app — send the link, send the sign. No server, no account.**

> Built by the daily routine on 2026-10-11; published on 2026-10-22 because the push failed (GitHub access). Reconstructed from the run's own event log.

```
 ┌──────────────────────────────┐        https://you.github.io/hashboard/#zLcixCoAgFEDRf7mz…   (105 chars)
 │            MATCH             │                           │
 │ ┌───────────┐ ┌────────────┐ │   open on any tablet/TV   │   scan the QR from the editor
 │ │   LIONS   │ │   TIGERS   │ │ ◀─────────────────────────┴──────────────────────────────▶ same board, same score
 │ │    21     │ │     17     │ │
 │ └───────────┘ └────────────┘ │   tap a side = +1 (long-press = −1) and the URL updates itself
 └──────────────────────────────┘
```

Screenshots of all six boards (`sign`, `count`, `score`, `queue`, `timer`, `sched`) are regenerated into `docs/` every time `npm test` runs.

## Use it

```bash
open index.html            # it is one file; works from file://, any static host, or a USB stick
# or:  npm start           # http://localhost:8080
```

Pick a board, edit it in the ⋯ sheet, then **Copy link**, **Show QR**, or **Kiosk mode** (fullscreen + screen wake lock).
Host `index.html` anywhere static (GitHub Pages, S3, a Raspberry Pi) and every link you make points at it.

| Board | What it does |
|---|---|
| **Sign** | Giant text auto-fitted to the screen ("BACK IN 10 MIN", "WIFI: guest / pw") |
| **Countdown** | Days/hours/min/sec to an *absolute* moment, so every screen in every timezone agrees; custom message at zero |
| **Scoreboard** | 2–8 teams, tap to add, long-press to subtract, arrow keys, configurable points per tap |
| **Queue number** | "Now serving 041", call next / back, issue tickets, "6 waiting" |
| **Focus timer** | Pomodoro with short and long breaks; a running timer is stored as its start time, so a reload or shared link keeps counting |
| **Schedule** | `09:30 Keynote` lines (also `9.30am`, `1430`); highlights what is on now and what is next |

## Why the URL is the app

State lives in the `#fragment`: JSON → deflate (`CompressionStream`) → base64url, whichever is shorter. Fragments never reach a server, so there is nothing to host, log, or lose. Every change (a tap, a typed word) rewrites the fragment with `history.replaceState`, so *the address bar is the save file*: bookmark it, message it, put it on a QR code, put it in a kiosk's start URL (`…?kiosk#…`).

## Why it exists

Shops, classrooms, coaches, stream hosts and event staff keep re-solving "I need a number on that old screen". The options are a native app, a SaaS signage account, or a slide deck. Show HN's *Bigwords.page* (≈300 points, Oct 2026) proved people want the URL-is-the-app idea; Hashboard adds the interactive pieces (tap-to-score, queue counters, timers with state) it doesn't have, plus a from-scratch QR generator so a phone can hand the board to a TV. Evidence and rejected candidates: [RESEARCH.md](RESEARCH.md).

## Sample run

```text
$ npm test
ok  every widget renders from a link; screenshots saved to docs/            (real Chromium)
ok  scoreboard tap updates the visible score AND the URL; reload keeps it
ok  queue: issue + call buttons; timer: start/pause
ok  hostile or damaged links never execute markup and fall back to the picker
ok  editor: picking a card builds a board, QR renders, link meter shown
ok  codec round-trips every widget, including unicode
ok  decode rejects garbage, truncation and unknown types without throwing
ok  pomodoro phase sequence: 2 rounds of 25/5 then long break 15, repeating
ok  schedule parser: formats, am/pm, bad lines, ordering, current/next
ok  QR: decodes with OpenCV (two detectors) for every version 1-20 and every mask
...
# tests 18   # pass 18   # fail 0   # skipped 0
```

The QR encoder is checked against an independent decoder (OpenCV, both detectors) across versions 1–20 and all 8 masks. The browser tests need Playwright + Chromium and the QR check needs `pip install opencv-python-headless`; each skips cleanly (and says so) when its dependency is missing.

## Limitations (honest)

- **Not synced.** Two screens on the same link do not share live state; tapping a score on one does not update another. Share the new link (or QR) after changes. (Counting from an absolute time, e.g. the countdown and a running timer, does stay in agreement.)
- Links grow with content; chat apps may truncate beyond ~2,000 characters (the editor shows a meter). QR codes cap at ≈850 bytes (byte mode, ECC level L, version ≤ 20).
- Compression needs `CompressionStream` (all current browsers); older ones fall back to uncompressed links.
- The schedule uses the *viewing* device's local clock; the countdown is absolute.
- Screen wake lock / fullscreen are best-effort and depend on the browser and OS.
- Fonts are the system UI font; no custom branding/logo upload (that would blow the URL budget).

## Layout

`core.cjs` pure logic (state validation, codec, widget math, QR) · `template.html` UI · `tools/build.mjs` inlines the core into the single-file `index.html` · `test/` unit + browser tests.

MIT licensed.

---
Development Experiment 070 of dev-experiments-365
