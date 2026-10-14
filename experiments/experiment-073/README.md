# Plainly

Paste a letter, see exactly what makes it hard to read, and fix it — in English, Español or Deutsch, offline, with no AI and no account.

> Built by the daily routine on 2026-10-14; published on 2026-10-22 because the push failed (GitHub access). Reconstructed from the run's own event log.

```text
$ node cli.js examples/letter-en.txt
Language   English   Target Plain (≈B1)
LIX        63.6  (very hard)
Flesch Reading Ease 29.2
Words 86   Sentences 3   Avg sentence 28.7 words
Verdict: NEEDS WORK at "plain"

#1 “Pursuant to Section 4 of the Housing Benefit Regulations, the claimant is required to n…”
   • Long sentence (63 words, target ≤ 17)
   • Passive voice
   • Noun-heavy (6 abstract nouns)
   • Long parenthetical
   • Plainer wording available (5)

$ node cli.js examples/letter-en.txt --apply > plainer.txt   # 8 swaps: "Prior to"→"Before", "shall"→"must", …
$ node cli.js plainer.txt          # LIX 63.6 → 56.7
```

## Use it

- **Web:** open `plainly.html` (one self-contained file; works from `file://`). Or open `index.html`, which loads `core.js`.
- **CLI:** `node cli.js letter.txt [--lang en|es|de] [--target easy|plain|standard] [--json] [--checklist] [--apply] [--fail]`
  (`--fail` exits 1 if the text misses the target, for CI on docs; `-` reads stdin).
- **Rebuild the single file:** `node build.js`. **Tests:** `npm test`.

Zero dependencies. Needs Node ≥ 18 only for the CLI and tests.

## What it does

- Auto-detects EN/ES/DE; scores with LIX (all languages) plus Flesch Reading Ease / Fernández-Huerta / Amstad, and the Wiener Sachtextformel for German.
- Highlights each sentence that is too long for the chosen target (≈A2 / B1 / B2), passive, noun-heavy, over-punctuated, or has long parentheticals.
- Marks officialese with a plainer alternative (55 EN, 38 ES, 39 DE phrases) and applies them in one click, with undo and a before/after score.
- Exports a Markdown rewrite checklist you can paste into a ticket or send to a colleague.

## Why it exists

Plain-language rules are now a legal and accessibility expectation (EU Accessibility Act enforcement since 2025, plain-language mandates in public services), but the tools are either closed (Hemingway, capito), LLM- and account-based, or give you a single Flesch number with no hint of what to change. Plainly is the open, local, multi-language version: it tells you *which sentence* and *why*, and your text never leaves the page. See [RESEARCH.md](RESEARCH.md).

## Limitations (honest)

- It is a heuristic assistant, not a certified readability or WCAG/EAA conformance tool. Scores are approximations.
- Syllable counting is rule-based (good for typical prose, wrong on some names and loanwords).
- Passive and noun-heavy detection use word patterns, not a parser; expect false positives and misses.
- Swaps are fixed phrases without inflection: `deberá` is covered but not every conjugation; German compound words are not split. Swapped text may need a grammar touch-up — always reread it.
- Only EN/ES/DE. No sentence rewriting beyond the swap dictionary (deliberately LLM-free).

## License

MIT.

---
Development Experiment 073 of dev-experiments-365
