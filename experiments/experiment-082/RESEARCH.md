# Research: Experiment 082

Date: 2026-10-26. Six parallel scouts (tech trends, market pain, devtools, data/doc productivity, AI/LLM tooling, wildcard). Several scouts had thin web access (HN/Reddit unreachable), so scores are judgement, not measured demand.

## Why SafeCSV won
Universal pain, visible in one screenshot (`SEPT1 → 1-Sep`), repeat use, single file/zero deps, and not close to any of the previous 81 entries (spreadsheet entries so far were diffing, statements, e-invoices; none address CSV→Excel safety).

Demand evidence (from the data/doc scout):
- BMC Bioinformatics 2004 on gene-name corruption: https://pmc.ncbi.nlm.nih.gov/articles/PMC459209
- HUGO renamed 27 genes because of it: https://office-watch.com/2020/gene-names-changed-to-stop-confusing-excel/
- jennybc/scary-excel-stories: https://github.com/jennybc/scary-excel-stories/blob/master/README.md
- Still reported in 2024: https://stat.ethz.ch/pipermail/r-devel/2024-April/083386.html
- Existing advice is the manual Text Import Wizard, per file.

## Shortlist (lost)
| Candidate | Lane | Score | Why it lost |
|---|---|---|---|
| AltTextr (batch alt text for docx/pptx) | data/doc | 7 | OOXML round-tripping riskier in one run; best backup |
| ICSmith (fix/merge/dedupe .ics) | data/doc | 6 | narrower audience |
| CSV Bouncer (Shopify import impact diff) | market | 6 | niche; drifts toward rule catalog; near previous sheet-diff |
| Landed (per-SKU true margin) | market | 6 | calculators are common; fee tables go stale |
| UTM Forge | market | 5 | crowded |
| Ctxweigh (token X-ray for CLAUDE.md/SKILL.md) | tech trends | 8 (scout) | too close to earlier skill/context entries (003, 006, 075); token estimator imprecise |
| Skillport (agent config converter) | tech trends | 7 | formats shift fast; adjacent to prior agent-config entries |
| ctxpack (context window packer) | AI/LLM | 7 | token-estimate precision; adjacent to above |
| promptdiff / llm-bill-calc | AI/LLM | 6 | crowded neighbors |
| AgeSignal Sandbox (mock AB 1043 age API) | wildcard | 6 | API shape not standardized |
| PlanPeek (EXPLAIN visualizer) | devtools | 6 | crowded (pev2 etc., unverified) |
| envdrift, TZ Table, Deadline Wall, HTML Tool Gallery Forge, Frametrim | various | 4-5 | low novelty or unverified demand |

## Caveats
Scouts could not fetch HN/Reddit; GitHub-existing-tool checks for SafeCSV were not possible in this run. Verify competitors (e.g. csvkit, Mr. Data Converter-style tools) before promoting to its own repo.
