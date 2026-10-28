# Research — Experiment 084 (2026-10-28)

Six parallel scouts (tech trends, market pain, devtools, docs/a11y, AI tooling, wildcard). Web evidence was thin: news.ycombinator.com was unreachable from the sandbox, so HN data comes from search snippets only. Scores are conservative.

## Winner: churnmap (githeat/gitmap)
- Demand: Ask HN "What developer tool do you wish existed in 2026?" (news.ycombinator.com/item?id=46345827, Dec 2025) — a commenter wanted "a heat-map of sorts for a codebase showing the files that have the most-frequent/most-recent edits". Codebase-comprehension tools are visible on GitHub monthly trending (Oct 2026).
- Gap: CodeScene/Sourcegraph are SaaS; git-quick-stats is text only; code-maat/Gource are clunky.
- Why chosen: visual (one screenshot), repeat use (every repo, every refactor), zero friction, new form factor vs. the last ten (not a linter, no rule catalog, not security).

## Shortlist that lost
| Idea | Lane | Score | Why not |
|---|---|---|---|
| docx-a11y (Office accessibility lint, ADA Title II driver) | docs/a11y | 7 | auditor with a rule catalog — banned overused form |
| htmlcap (HTML → MP4/GIF) | tech | 7/4 | foreignObject fidelity risk in one run |
| gainmap-peek (HDR JPEG gain-map inspector) | wildcard | 6 | strong runner-up; binary-inspector kin to HexLens (074) |
| squeezelog (shrink logs for LLM paste) | tech | 6 | close to Logfold (069) |
| FeedPatch (Merchant Center feed fixes) | market | 5 | rule-pack linter flavour |
| UTMdrift | market | 6 | audit-flavoured; weak owner-voice evidence |
| ctxbudget / spendscan / promptdiff | AI | 5–6 | crowded; near prior cache/context work |
| Hexfuzz | devtools | 6 | duplicates HexLens (074) |
| midi2-clip, shaper-lens, local-notes overlay, llms.txt kit | misc | 4–6 | niche or weak evidence |
