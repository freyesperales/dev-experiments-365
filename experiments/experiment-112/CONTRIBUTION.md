# Contribution notes — 112

- Target repo: https://github.com/withastro/docs (base branch `main`)
- Fork: https://github.com/freyesperales/docs, branch `docs-spinal-dead-link`
- PR: https://github.com/withastro/docs/pull/15000
- PR title: Remove dead link from Spinal CMS guide
- Commit author: Francisco Reyes, with `Co-Authored-By: Claude` trailer; AI assistance declared in the PR text
- Problem: the only link under "Official Resources" in `src/content/docs/en/guides/cms/spinal.mdx` returns 404; the theme and its GitHub repo no longer exist.
- Change: remove the section (3 lines, English page only, as the PR template asks).
- Reproduction: `test-log.txt` (404 before; the remaining links in the file answer 200 after).
- Status: submitted.

## Open pull requests to watch next Saturday
- https://github.com/withastro/docs/pull/15000 — opened today.
- https://github.com/WiseLibs/better-sqlite3/pull/1536 — open since 2026-11-21, no activity.
- https://github.com/ranaroussi/yfinance/pull/3045 — open since 2026-11-14, no reply since the 2026-11-16 rework.

Do not open a second PR in any of these repositories.

## For Francisco (cannot be sent by the agent)
1. **vercel/next.js** — `docs/01-app/01-getting-started/17-deploying.mdx` line 42 links Docker's Next.js and React.js guides, which return 404 since Docker's docs redesign (docker/docs#26676, merged 2026-11-19). A replacement that exists: https://docs.docker.com/build/building/best-practices/ (200). Next.js requires the PR description to be **written by a human** and commits to be **signed** (GPG/SSH), so it has to be sent by Francisco in his own words.
2. **lovell/sharp** — `docs/src/content/docs/install.md` line 243, electron-builder `asarUnpack` link returns 404; the electron-builder site now documents the v27 alpha where the option moves to `asar.unpack`. sharp's policy says PR descriptions must be in the contributor's own words, and the fix needs a decision on which electron-builder version to document. Better as a question to the maintainer, written by Francisco.
