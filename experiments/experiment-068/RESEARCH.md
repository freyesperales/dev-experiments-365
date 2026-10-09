# Research — Development Experiment 068 (2026-10-09)

Six parallel scouts (tech trends, market pain, devtools, docs/accessibility, practical AI tooling, wildcard).
Egress was partly restricted (HN blocked); evidence is mostly secondary and flagged as such.
The devtools scout reported late (HN/dev.to blocked; evidence weak); its candidates are scored below.

## Shortlist and judge scores
Scored 1-5 on: demand, shareability, repeat use, feasibility (one run, offline, testable), novelty vs ledger 001-064 / diversity.

| Candidate | Lane | D | S | R | F | Nov | Total | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Spoolslip** - offline print receipt from .3mf/.gcode (time, grams, cost) | wildcard / maker | 4 | 5 | 4 | 5 | 5 | **23** | **WINNER** - brand new audience (3D-printing makers), zero overlap with ledger, verifiable file formats |
| Loupe - streaming CSV/JSON explorer | docs | 4 | 3 | 4 | 4 | 2 | 17 | crowded category; ledger already has several spreadsheet tools (054, 062, 064) |
| ctxweigh / toolbill - agent context & tool-schema cost | tech / AI | 4 | 4 | 3 | 4 | 2 | 17 | strong trend, but ledger is dominated by MCP/agent-manifest tooling |
| Plainly - plain-language scorer | docs | 3 | 3 | 3 | 5 | 3 | 17 | readability-checker space is saturated; rule-catalog shaped |
| UTM Governor | market | 3 | 3 | 4 | 5 | 3 | 18 | many SaaS builders; unverified demand |
| FeedLint (Merchant Center) | market | 3 | 3 | 3 | 3 | 3 | 15 | depends on Google spec accuracy we could not verify; checker-shaped |
| wa.me Batch | market | 3 | 3 | 3 | 5 | 3 | 17 | many free generators |
| CRA Scope Wizard | wildcard | 3 | 3 | 2 | 3 | 2 | 13 | legal accuracy risk; EU-law lane already used (052) |
| DocAlt (docx/pptx a11y) | docs | 3 | 3 | 3 | 3 | 2 | 14 | auditor with a rule catalog - excluded by the brief |
| Schengen 90/180 | wildcard | 3 | 3 | 4 | 4 | 3 | 17 | crowded calculators |
| lockdiff - human-readable multi-ecosystem lockfile diff | devtools | 3 | 4 | 4 | 4 | 3 | 18 | no demand evidence found; dependency-tooling adjacent to ledger |
| harlens - offline HAR waterfall + diff | devtools | 3 | 3 | 3 | 4 | 3 | 16 | weak evidence |
| tokenledger - agent session context accounting | devtools/AI | 4 | 4 | 3 | 4 | 2 | 17 | crowded viewers; agent-tooling theme already dominant |
| worktree-board | tech | 3 | 3 | 3 | 5 | 3 | 17 | worktrunk et al. already cover it |

## Demand evidence for the winner
- Bambu Lab's authorization change pushed users toward offline / LAN-only workflows:
  https://all3dp.com/4/bambu-lab-responds-to-security-update-controversy-promises-developer-mode/
- May 2026: Bambu pressured an independent developer to take down an OrcaSlicer fork that reconnected to its cloud:
  https://all3dp.com/4/bambu-lab-took-down-an-orcaslicer-fork-and-handed-it-a-bigger-audience
  https://tech.slashdot.org/story/26/05/11/0235215/
- AGPL dispute ongoing: https://www.eevblog.com/forum/other-blog-specific/very-interesting-bambu-lab-cease-n-desist-case
- Wedge: slicers and cloud apps show time/filament only inside their own app, per job. Nothing obvious drops multiple files into
  one offline page and yields a cost-per-job table and CSV. (Search coverage was thin; "no clear equivalent" is the scout's
  judgement, not an exhaustive survey.)

## Caveats
Slicer header formats were written from knowledge of Bambu Studio / OrcaSlicer / PrusaSlicer / Cura output conventions and
verified only against synthetic fixtures built in this repo, not against a large corpus of real slicer files.
