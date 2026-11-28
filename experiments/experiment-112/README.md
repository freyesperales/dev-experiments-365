# Saturday OSS — Astro docs: dead Spinal link removed

The Astro docs guide for Spinal CMS sent readers to a documentation theme that no longer exists; this contribution removes the dead link.

En español: la guía de Astro para el CMS Spinal enlazaba a un tema de documentación que ya no existe (error 404, y su repositorio también desapareció). Esta contribución quita ese enlace muerto, como pide la guía de contribución de Astro.

**Pull request:** https://github.com/withastro/docs/pull/15000 (against `main`, opened 2026-11-28)

## The problem
`src/content/docs/en/guides/cms/spinal.mdx` ended with:

```md
## Official Resources
- [Documentation theme built for Astro with Tailwind CSS](https://spinalcms.com/resources/astro-documentation-theme-with-tailwind-css/)
```

That page returns 404, the whole `spinalcms.com/resources/` section is gone, and the GitHub repo the page pointed to (`spinalcms/astro-docs-template`) no longer exists. The Wayback Machine still had the page on 18 July 2026.

## The fix
```diff
 All Markdown content from the selected folder will be imported into your Spinal account and is ready to be edited.
-
-## Official Resources
-- [Documentation theme built for Astro with Tailwind CSS](https://spinalcms.com/resources/astro-documentation-theme-with-tailwind-css/)
```
There is no replacement to link to, so the section goes; 21 of the 46 CMS guides have no "Official Resources" section. English page only, as the PR template asks. Diff: [`change.patch`](change.patch).

## Verification
```
404 https://spinalcms.com/resources/astro-documentation-theme-with-tailwind-css/
404 https://spinalcms.com/resources/
{"message":"Not Found", ...}   GitHub API: spinalcms/astro-docs-template
## After: every external link left in the file
200 https://spinalcms.com/cms-for-astro/
200 https://spinalcms.com/signup/
```
Full log in [`test-log.txt`](test-log.txt).

## Why this one
Astro's contributing guide asks for direct PRs for broken links, and a similar dead-link removal with declared AI assistance was merged two days earlier (withastro/docs#14975). Two stronger findings were **not** sent automatically because those projects require the PR text to be written by a person: Next.js (Docker's Next.js and React guides, linked from the deploying docs, return 404 since 19 November) and sharp (electron-builder link). They are written up for Francisco in [`CONTRIBUTION.md`](CONTRIBUTION.md). Full candidate list and sources: [`RESEARCH.md`](RESEARCH.md). PR text: [`pr-body.md`](pr-body.md).

## Limitations
A three-line documentation change. The maintainers may prefer another fix or decline it; this folder records what was sent, not the outcome. Links were checked from one network on one day, with curl, not a full browser.

---
Daily Security Lab · Experiment 112 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
