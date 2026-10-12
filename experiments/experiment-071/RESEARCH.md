# Research — Experiment 071 (2026-10-12)

Six parallel scouts (tech trends, SMB pain, devtools, data/docs/a11y, AI tooling, wildcard). Web search was weak on fresh forum threads; several lanes reported mostly circumstantial evidence, which is noted per item.

## Winner: gguf-xray (AI-tooling lane, score 7)
- Evidence: ~14% of 400 popular GGUF repos render a different prompt than upstream (ggufdoctor, pypi.org/project/ggufdoctor); recurring Qwen3 `--jinja` / `[::-1]` template parse failures and community template patches (Hugging Face, e.g. Qwen3-Coder-Next and Gemma 4 patches); plenty of manual VRAM calculators (Slopsome, flaviocopes, devtk) none of which read the real file.
- Wedge: reads the actual header, exact per-tensor sizes, real KV-head count, embedded template; offline, file never uploaded.
- Why it won: no overlap with prior 64 entries (no GGUF/LLM-runtime tool); form factor (single HTML + CLI) differs from the last 5 (PDF redaction, disk reclaimer, statement converter, contrast fixer, sheet diff); high repeat use (every model download); highly screenshot-able; fully testable offline with synthetic fixtures.

## Shortlist that lost
| Candidate | Lane | Score | Why not |
|---|---|---|---|
| Sandfall (falling-sand toy) | wildcard | 7 | Crowded, no real utility, weak demand evidence |
| HARbor (HAR waterfall + redaction + diff) | devtools | 7 | Strong runner-up; privacy angle good, but redaction overlaps exp 060's theme; needs a large UI |
| Temporal Rosetta | tech trends | 7 | Verified Node 26 default-on, but a docs-style translator with weak repeat use |
| Context Diet (CLAUDE.md token cost) | tech trends | 7 | Crowded theme, close to linter pattern |
| ChatToSheet (WhatsApp orders → table) | SMB | 7 | Parsing quality hard to demo/verify across languages; no hard demand data |
| Cuesheet (SRT/VTT two-anchor resync) | data/a11y | 6 | exp 056 already covers subtitles |
| GGUF alternatives: CacheBust, ContextHog | AI | 6 | Overlap with ccusage/Debrief, or transcript-format fragility |
| Plainly, Altitude, HandleFix, AnswerReady, Cronsense, Diffpaste, Pingshelf, Driftlog, Status Mirror | various | 5–6 | Linter-like, crowded, or niche |

Judge: scored on demand × shareability × repeat use × feasibility, with hard penalties for linter/auditor shape and recent-theme overlap.
