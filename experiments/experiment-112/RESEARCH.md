# Research — Experiment 112 (Saturday, open-source contribution)

Lane: Saturday — one real contribution to an open-source project Francisco uses.
Date: 2026-11-28 (UTC). The main agent checked last week's pull requests and sharp's docs itself, then launched 3 scouts in parallel (Astro; Next.js; lucide, claude-code, requests and python-dotenv). Every finding the scouts reported for the chosen target was re-checked by the main agent before the PR was opened. Every link below was requested in this run.

Note on this network: several sites behind Cloudflare return `000` from this PC unless curl runs with `--ssl-no-revoke` (Windows certificate revocation check). Those are not broken links and were not treated as such. npmjs.com answers 403 to scripts; also not broken.

## First: open pull requests from previous Saturdays
| Source | Source date | Accessed | Takeaway |
|---|---|---|---|
| https://github.com/WiseLibs/better-sqlite3/pull/1536 | opened 2026-11-21 | 2026-11-28 | Open, no comments or reviews. Nothing to do; no second PR there. |
| https://github.com/ranaroussi/yfinance/pull/3045 | comment 2026-11-15 | 2026-11-28 | Open; the only comment is the maintainer's objection already answered on 2026-11-16. No new activity. |

## Chosen target: withastro/docs (Astro, used in Francisco's web projects)
| Source | Source date | Accessed | Takeaway |
|---|---|---|---|
| https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/cms/spinal.mdx | main @ bbd99cf (2026-11-27) | 2026-11-28 | Primary: the only item under "Official Resources" links to Spinal's Astro documentation theme. |
| https://spinalcms.com/resources/astro-documentation-theme-with-tailwind-css/ | no date | 2026-11-28 | Primary: **404** with a browser user agent (page title "This page has gone missing (404)"). |
| https://spinalcms.com/resources/ | no date | 2026-11-28 | 404: the whole resources section is gone. |
| https://api.github.com/repos/spinalcms/astro-docs-template | — | 2026-11-28 | Primary: 404 — the theme repository the page linked to no longer exists. |
| https://web.archive.org/cdx/search/cdx?url=spinalcms.com/resources/astro-documentation-theme-with-tailwind-css/ | captures 2026-01-16, 2026-04-17, 2026-07-18 | 2026-11-28 | The page answered 200 until at least 18 July 2026, so it disappeared recently. |
| https://spinalcms.com/cms-for-astro/ and https://spinalcms.com/signup/ | no date | 2026-11-28 | The two other external links in the file work (the first 301 → `/cms-for/astro/`, 200). Left untouched. |
| https://github.com/withastro/docs/blob/main/CONTRIBUTING.md | main @ bbd99cf | 2026-11-28 | Primary: "Make a PR directly for very obvious documentation fixes like typos or broken links"; lists "unsolicited PRs to address typos, broken links" as helpful. No general AI ban. PR template: change only one language. |
| https://contribute.docs.astro.build/guides/hacktoberfest/ | no date | 2026-11-28 (scout) | The only AI rule found is for the Hacktoberfest event: AI may help draft but the contribution must be checked and edited. Not a general rule; disclosure kept anyway. |
| https://github.com/withastro/docs/pull/14975 | merged 2026-11-26 | 2026-11-28 | Primary precedent: an outside contributor removed a dead Docker link with no replacement, declared "Prepared with AI assistance", merged. |
| `gh search prs/issues --repo withastro/docs spinal --state open` | — | 2026-11-28 | Nothing open covers it. Francisco has no PR in this repository. |

## Ruled out today
| Source | Source date | Accessed | Takeaway |
|---|---|---|---|
| https://github.com/lovell/sharp/blob/main/docs/src/content/docs/install.md | main @ 338f5a0 (2026-11-28) | 2026-11-28 | Line 243 links electron-builder's `asarUnpack` to `www.electron.build/app-builder-lib.interface.platformspecificbuildoptions#asarunpack`: **404**. |
| https://www.electron.build/docs/api/app-builder-lib.Interface.PlatformSpecificBuildOptions | v27 docs | 2026-11-28 | 200, but the docs site now shows 27.0.0-alpha, where `asarUnpack` moves to `asar.unpack`; the latest stable (26.18.0, `npm view electron-builder dist-tags`) still uses `asarUnpack`. Fixing the link means choosing which version to document — a maintainer call. |
| https://github.com/lovell/sharp/blob/main/.github/CONTRIBUTING.md | main | 2026-11-28 | Primary: "Never let an LLM speak for you … descriptions on issues and pull requests should be written in your own words". An unattended agent cannot honour that. **Skipped** for automatic PRs; left as an idea for Francisco to send himself. |
| https://github.com/electron-userland/electron-builder/blob/master/CHANGELOG.md | 27.0.0-alpha.15 (2026-11-20) | 2026-11-28 | Primary: `migrate-schema` rewrites platform-level `asarUnpack` to `<platform>.asar.unpack` for v27. |
| https://github.com/vercel/next.js/blob/canary/docs/01-app/01-getting-started/17-deploying.mdx | canary @ 91488f9 | 2026-11-28 (scout + re-check) | Line 42 links Docker's Next.js and React.js guides; https://docs.docker.com/guides/nextjs and https://docs.docker.com/guides/reactjs both **404** (re-checked). |
| https://github.com/docker/docs/pull/26676 | merged 2026-11-19 | 2026-11-28 | Primary: "Redesign Docker Docs with product-focused navigation" — the redesign that retired the per-language guides. |
| https://github.com/vercel/next.js/blob/canary/.github/pull_request_template.md | canary | 2026-11-28 (scout) | Primary: "pull request descriptions from external contributors must be written by a human"; commits must be signed. **Not sent automatically**; good candidate for Francisco to send with his own words (see CONTRIBUTION.md). |
| https://github.com/psf/requests/blob/main/.github/AI_POLICY.md | main | 2026-11-28 (scout) | "Absolutely no unsupervised agentic tools"; PRs with an LLM co-author are closed. Excluded. Its only near-miss (a Twitter link that now redirects to a homepage) is not a 404 anyway. |
| lucide-icons/lucide, anthropics/claude-code, theskumar/python-dotenv | main | 2026-11-28 (scout) | ~100 lucide URLs, the claude-code READMEs and the python-dotenv docs and CLI: no 404 and no documented option missing from the code. |
| https://github.com/withastro/docs/issues/14844 | open | 2026-11-28 (scout) | Lucia auth links are dead, but the maintainer closed four PRs and asked not to send PRs for untriaged issues. Avoided. |
| https://docs.deno.com/deploy/manual/deployctl | no date | 2026-11-28 (scout) | 404 in Astro's Deno guide, but Deno Deploy changed its CLI and announced a shutdown; the guide needs rethinking, which is an issue, not a link fix. |

## Shortlist (JUDGE: usefulness × freshness × feasibility × clear-cut, 1–5 each)
| Candidate | Problem | Score | Decision |
|---|---|---|---|
| **withastro/docs — Spinal guide** | Only "Official Resources" link 404, theme and repo gone | 2×5×5×5 = **250** | **Chosen**: the contributing guide asks for exactly this kind of PR; recent precedent merged |
| vercel/next.js — deploying docs | Both Docker guide links 404 since 2026-11-19 | 4×5×4×4 = 320 | Higher value but **not automatable**: the PR description must be written by a human and commits signed. Prepared for Francisco instead |
| lovell/sharp — electron-builder link | 404 + docs now describe v27 alpha | 3×4×2×2 = 48 | Skipped: AI policy and a version decision |
| Astro — Deno guide | Dead link + product change | 3×4×1×2 = 24 | Issue material, not a PR |
| requests — Twitter streaming link | Redirects to a homepage | — | Excluded by its AI policy |
