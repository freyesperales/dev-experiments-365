# HexLens

**Search any binary file by *value* — "any int32 between 1.7e9 and 1.8e9", "a float near 37.77", "any timestamp in June 2024" — not just exact bytes.**

> Built by the daily routine on 2026-10-15; published on 2026-10-22 because the push failed (GitHub access). Reconstructed from the run's own event log.

Drop a file into one HTML page (or run one Node command). HexLens tries every integer/float width, both endiannesses and four timestamp epochs at every offset, and draws a structure heat strip so you can see where the headers, tables, text and compressed blobs are.

## Demo

A made-up save file hides the same instant (2024-06-01 12:00 UTC) in four different encodings. One query finds all of them:

```console
$ node tests/make-sample.js samples/demo.sav   # writes the 2 KB demo file
$ node hexlens.js samples/demo.sav --find date:2024-06-01
samples/demo.sav — 2048 bytes — unknown type
0x00000008  u32 LE  1717243200  [unix s]
0x00000008  i32 LE  1717243200  [unix s]
0x00000008  u64 LE  1717243200  [unix s]
0x00000008  i64 LE  1717243200  [unix s]
0x00000060  u64 LE  1717243200000  [unix ms]
0x00000060  i64 LE  1717243200000  [unix ms]
0x00000068  u64 LE  133617168000000000  [FILETIME]
0x00000068  i64 LE  133617168000000000  [FILETIME]
0x00000070  f64 LE  738936000  [Cocoa s]
9 hit(s)
```

Unix seconds at `0x08`, milliseconds at `0x60`, a Windows FILETIME at `0x68`, an Apple Cocoa float at `0x70` — with no grammar, no pattern file, no guessing at byte order.

## Run it

```sh
open index.html          # or just double-click it: single file, works offline, no install
node hexlens.js FILE --find "37.77~0.05"   # CLI, zero dependencies (Node 18+)
npm test                 # 19 tests
```

Generate the demo file with `node tests/make-sample.js samples/demo.sav`, or click **load a built-in demo file** on the page to try it without a file.

## Query language

| Query | Meaning |
|---|---|
| `1700000000..1800000000` | any integer or float in that range (hex `0x..` works) |
| `37.77~0.05` | value ± tolerance (floats: f32 + f64) |
| `date:2020-01-01..2024-12-31` | timestamps in that UTC range as unix s, unix ms, Windows FILETIME or Apple Cocoa |
| `date:2024-06-01` | one whole day |
| `hex:de ad be ef` | exact bytes |
| `text:config` | ASCII/UTF-8, Latin-1 and UTF-16LE |

Options: *natural alignment* only reports values at offsets divisible by their width — the fastest way to cut coincidental matches. Click any byte for the **Inspector**: every width/endianness reading plus any plausible date. The **Strings** tab includes *length-prefixed* strings (u8/u16/u32) that `strings(1)` presents as noise:

```console
$ node hexlens.js samples/demo.sav --strings
samples/demo.sav — 2048 bytes — unknown type
0x00000011  len-prefixed u8  Aria the Bold
0x000000a2  len-prefixed u16 last_checkpoint=forest_gate
0x00000600  ascii            
```

## Why it exists

Exact-byte search is useless when you know a *value* but not its encoding: a game-save's gold count, a coordinate in a proprietary log, "some timestamp from last March". Tools that do understand structure (ImHex, 010 Editor, Kaitai) need you to write a pattern or grammar first, and 010 is paid. Online hex viewers are dumb. HexLens is the exploratory step you do *before* writing the grammar. Origin of the idea: an Ask HN request for an "explorative hex editor where you can do fuzzy searches" (see [RESEARCH.md](RESEARCH.md)).

## Privacy

The page makes no network requests and loads nothing external — verify in DevTools → Network. Files are read locally via the File API.

## Limitations

- Everything is in memory; search runs on the main thread. Fine up to tens of MB, slow-ish on hundreds. No Web Worker/streaming yet.
- 64-bit ints are compared as JS numbers, so values above 2^53 lose precision (matters for exotic FILETIME ranges only at the extreme ends).
- Float search over data with many tiny values can match noise; use a tight tolerance and *natural alignment*.
- Hits are capped (3000 in the UI, 200 in the CLI) and the result says when truncated.
- Structure map and string finders are heuristics, not a parser. It is read-only: no editing or saving.
- Dates are UTC; timestamp plausibility window is 1995–2040.

## Sample run

Captured from this repo (`npm test`):

```
# tests 19
# pass 19
# fail 0
```

Browser smoke test (headless Chromium): demo loaded, `date:2024-06-01` → 9 hits, 0 console errors, 0 network requests.

---
Development Experiment 074 of dev-experiments-365
