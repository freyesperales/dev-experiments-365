# EasyReadify

Paste plain text, get a printable Easy Read page: one idea per block, big type, a picture slot for each — in one offline HTML file.

## Demo

Input (one dense paragraph) → output blocks, with hints for the human editor:

```
1. You must apply for the housing benefit before the 30th of April. [12w]
2. You will need to provide documentation regarding your income. [9w]
     ! Simpler word: regarding → about
     ! Hard word? documentation — explain or replace
3. If your circumstances change, you should inform the council immediately. [10w]
     ! Simpler word: inform → tell
     ! Hard word? immediately — explain or replace
4. Failure to do so may result in the payment being terminated. [11w]
     ! Maybe passive — say who does it
5. Individuals who are eligible will be contacted by the Housing Team (HT) within 14 days. [15w]
     ! Simpler word: Individuals → people, eligible → allowed
     ! Abbreviation: HT — spell out
     ! Maybe passive — say who does it
     ! Brackets or semicolon — split into separate ideas
{"blocks":5,"avgWords":11.4,"over":0,"flagged":4}
```

Then add pictures, press **Print / save PDF**: each block becomes a row with a picture box on the left and bold 22pt text on the right.

## Run

```
open index.html        # or: npm start  (serves on :8066)
npm test               # 10 tests, node >= 18, zero dependencies
```

## Why it exists

Councils, charities and health teams must publish Easy Read versions of documents (short sentences, large type, one image per idea). Outsourcing is reported at roughly £120 per page (UKAuthority on Swindon's tool), and the existing free tools are AI-based demos. EasyReadify does the **layout and the nagging**, not the writing: your words stay yours, nothing is uploaded, no hallucinations, no account.

## Features
- Sentence splitter (handles Dr., e.g., list bullets); auto-split long sentences at ";" and ", and/but/so/because/which"
- Per-block hints: too long, simpler-word table, hard words, abbreviations, passive voice, brackets
- Reorder, split at cursor, edit inline; add a picture from disk to any block
- Adjustable font size and word limit; autosaves to localStorage
- Print-to-PDF stylesheet; copy as Markdown

## Limitations
- Heuristics, not NLP: syllable count and passive detection are approximate; hints are suggestions.
- Auto-split is mechanical; always re-read the result. English only.
- Pictures are stored as data URLs in localStorage (4 MB each); very many large images may exceed browser quota (autosave then silently stops).
- Does not certify compliance with any Easy Read standard.

Development Experiment 066 of dev-experiments-365
