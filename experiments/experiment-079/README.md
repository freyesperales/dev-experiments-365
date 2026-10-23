# Cuepoint

**Subtitles drift, jump after the ad break, or show mojibake? Pin two cues to where they belong and Cuepoint re-times the whole file — offline, one HTML file, zero dependencies.**

```
$ node cli.js samples/drifty.srt \
    --anchor 00:00:33.566=00:00:35 --anchor 00:09:11.448=00:09:35 \
    --anchor 00:10:25.219=00:10:05 --anchor 00:19:31.872=00:19:35 \
    --strip-hi --strip-watermarks
samples/drifty.srt → samples/drifty.synced.srt  [piecewise-linear retiming through 4 anchors (offsets +1434, +23552, -20219, +3128 ms)]  cleaned: dropped 7, watermark 1, hiStripped 11
```

That sample is a file made for 25 fps video, playing on 23.976 fps (drift) **and** with a 45 s chunk added after a cut (jump). A global "shift by N seconds" tool cannot fix it; pinned anchors can.

## Run it

- **Web (zero install):** open `index.html`, drop a subtitle file, click **Pin** on a cue you know the true time of (do it again at the far end), download. Nothing is uploaded.
- **CLI (Node ≥ 18, no dependencies):** `node cli.js movie.srt --shift +2.5`, `--anchor FROM=TO` (repeat), `--mode smooth|step`, `--fps 25:23.976`, `--to vtt|srt|ass|sub`, `--strip-hi --strip-tags --strip-watermarks`, `--merge part2.srt`, `--info`. Several input files = batch mode. Run `node cli.js --help`.
- **Tests:** `npm test` · **Rebuild the HTML:** `npm run build`.

## What it fixes

| Symptom | How |
|---|---|
| Constant offset | one pin, or `--shift` |
| Drift (23.976 vs 24/25 fps) | two pins (linear stretch), or `--fps 25:23.976` |
| Jump after a cut / ad break | pins on both sides; `step` mode keeps a constant offset per segment |
| `Ã©`, `?` instead of accents | strict UTF-8, then Windows-1252 fallback; double-encoded text is detected and reversed; or force an encoding |
| Overlaps, zero-length, unsorted, duplicate cues | automatic repair (on by default) |
| `[door slams]`, `JOHN:`, ♪ lines, `<i>`, "Subtitles by…" credit cues | opt-in strippers |
| Two-part (CD1/CD2) files | `--merge` with an offset |
| Format mismatch | read/write SRT, WebVTT, ASS/SSA, MicroDVD `.sub` |

## Why it exists

Subtitle-sync demand is perennial (Plex/Jellyfin/Infuse users, learners, archivists), but the quick tools only shift by a constant or fix purely linear drift (`srtresync`, web "shifters"), and the full editors (Subtitle Edit, Aegisub) are heavy desktop apps. Cuepoint's wedge is piecewise multi-anchor sync in a file you can open anywhere. See `RESEARCH.md`.

## Limitations

- It does not listen to audio: you provide the true time of 1+ cues. No automatic alignment.
- ASS output uses one default style; styling from an input ASS file is not preserved (text and timing are). Inline `{\tags}` are dropped on ASS import.
- Encoding auto-detect is only UTF-8 vs Windows-1252 (plus BOMs). For other legacy code pages pick the encoding manually.
- MicroDVD files carry frame numbers, so the frame rate you give must match the video.
- "Strip HI" is heuristic (brackets, ♪, ALL-CAPS speaker labels) and can occasionally remove legitimate text; review the result.
- Output is always UTF-8.

## Sample run (verified in this repo)

`node --test test/test.js` → 21 tests pass. `node cli.js samples/drifty.srt --info` → `SRT, 40 cues, 00:00:04,795 -> 00:19:34,372, encoding utf-8`. The browser UI was smoke-tested headless (load, pin two cues, download, no console errors).

MIT · Development Experiment 079 of dev-experiments-365
