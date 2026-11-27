# Research — experiment 111 (Friday 2026-11-27, lane: secrets in repos and supply chain)

Three scouts ran in parallel with live web search and fetch. The builder then re-opened the primary sources below with `curl` and checked the quoted rules in the page text before writing any matching code. Access date for every link: **2026-11-27**.

Excluded up front (already built in this lab): npm lockfile auditor (089, 092), GitHub Actions auditor (087, 088, 095), leaked-key triage for a pasted .env (104), AI coding-agent config auditor (093, 094).

## Sources

### Primary (specs, vendor docs, advisories) — re-opened by the builder
| URL | Source date | Takeaway |
|---|---|---|
| https://git-scm.com/docs/gitignore | no date | "Within one level of precedence, the last matching pattern decides"; a pattern without a slash matches at any level; "It is not possible to re-include a file if a parent directory of that file is excluded"; rules for `**/`, `/**` and `/**/`. |
| https://git-scm.com/docs/git-check-ignore | no date | By default tracked files are not shown "since they are not subject to exclude rules": a `.gitignore` line does nothing for a file that is already committed. |
| https://docs.docker.com/build/concepts/context/ | no date | `.dockerignore` matching uses Go's `filepath.Match` plus `**`; leading and trailing slashes are disregarded; the docs' own example says `*.md` excludes markdown files at the root while "markdown files under subdirectories are still included"; the last matching line decides; a Dockerfile-specific ignore file takes precedence. |
| https://github.com/moby/patternmatcher (patternmatcher.go, main) | no date | `MatchesOrParentMatches`: a pattern excludes a path when it matches the path or any parent directory; the older `Matches` is marked deprecated as buggy. |
| https://docs.docker.com/build/building/secrets/ | no date | "Build arguments and environment variables are inappropriate for passing secrets to your build, because they persist in the final image." Use secret mounts. |
| https://docs.npmjs.com/cli/v11/configuring-npm/package-json | no date | "If there is a .gitignore file, and .npmignore is missing, .gitignore's contents will be used instead" (so an .npmignore replaces it); always-included files (package.json, README, LICENSE, main, bin) and always-ignored files (.git, .npmrc, node_modules, lockfiles…). `.env` is not on the always-ignored list. |
| https://docs.npmjs.com/cli/v11/commands/npm-pack | last edited 2025-10-04 | `--dry-run` prints what would be packed, with no warning about sensitive files. |
| https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository | no date | First revoke or rotate the secret ("that may be sufficient"); history rewrite needs git-filter-repo 2.47+ with `--sensitive-data-removal`; forks keep the commit. |
| https://www.stepsecurity.io/blog/microsoft-agent-framework-pypi-package-compromised | 2026-11-18 | Versions 1.26.1 and 1.26.2 of `agent-framework` on PyPI (17-11-2026) carried a credential stealer installed as a `.pth` startup hook. Fresh supply-chain context; candidate B below. |
| https://raw.githubusercontent.com/Natizyskunk/vscode-sftp/master/README.md | no date | The SFTP extension's `.vscode/sftp.json` config has a `"password"` field: a file that holds the hosting password and often sits in a project folder. |

### Secondary (defender pain, analysis, existing tools) — opened by the scouts in this run
| URL | Source date | Takeaway |
|---|---|---|
| https://trufflesecurity.com/blog/how-secrets-leak-out-of-docker-images | 2023-09-11 (byline) | `COPY . .` followed by `RUN rm .env` still leaves `.env` in the earlier layer; shown with Dive. Cites 289,000 Dockerfiles with `COPY . .` on GitHub (their search, not verified here). |
| https://wordpress.org/support/?p=17869961 | attacks from 2024-07-03 | A small site owner asks how to protect `.env` while bots request it; the support answer is that WordPress has no `.env`, so blocking is the owner's job. |
| https://www.acunetix.com/vulnerabilities/web/dotenv-env-file | no date | A readable `.env` in a web directory is classed as high-severity information disclosure. |
| https://docs.github.com/en/code-security/secret-scanning/introduction/about-secret-scanning | no date | Secret scanning is free for public repositories; private organisation repositories need GitHub Secret Protection (paid). |
| https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection | no date | Push protection for users is on by default for public repositories only. |
| https://github.com/gitleaks/gitleaks | no date | Scans contents with regex rules; the project now calls itself feature complete. Does not reason about which files a given ignore file lets through. |
| https://github.com/trufflesecurity/trufflehog | no date | AGPL-3.0; verifies findings by sending the credential to the provider's API. |
| https://github.com/Yelp/detect-secrets | no date | Content scanner with a baseline; no rules by file name. |
| https://devtoollab.com/tools/gitignore-tester | no date | Browser `.gitignore` pattern tester: English only, no `.dockerignore`, no npm, no notion of which files are secret. |
| https://docs.npmjs.com/cli/v11/using-npm/config | no date | `ignore-scripts` is off by default; `allowScripts` exists. Covers install scripts (candidate C), not file leaks. |
| https://pnpm.io/settings/build | no date | pnpm 11 blocks dependency build scripts not in `allowBuilds`. Reduces the gap for candidate C. |
| https://github.com/lirantal/npq | no date | Install-time checks for scripts and typosquats; CLI that calls external services. |
| https://socket.dev/pricing | no date | Free tier exists but appears to require an account. |
| https://rankmath.com/kb/pro-3-0-123-security-incident/ | no date (incident 2026-10-15/16) | Compromised premium WordPress plugin update with published IoCs. Considered and left for the Tuesday CMS lane. |
| https://www.securityweek.com/rank-math-pro-wordpress-plugin-compromised-in-supply-chain-attack/ | 2026-10-19 | Same incident; clean version 3.0.124. |
| https://bleepingcomputer.com/news/security/microsofts-agent-framework-pypi-package-compromised-to-steal-credentials | 2026-11-18 | Names the `.pth` files of the PyPI compromise. |
| https://snyk.io/blog/laravel-lang-supply-chain-advisory/ | 2026-05-23 | Re-pointed git tags on Packagist via a leaked GitHub token. Older than the six-week window. |

Count: 10 primary sources re-opened by the builder, 18 more opened by the scouts. No figure in the tool or README comes from a source that was not opened.

## Candidates and JUDGE (1–5 each: usefulness to a small business × freshness × feasibility in one run × shareability)

| Candidate | Use | Fresh | Feasible | Share | Total |
|---|---|---|---|---|---|
| **A. Equipaje — which secret-bearing files leave with Git, npm, a Docker image or the public web folder, and the line that stops each** | 5 | 3 | 4 | 5 | **17** |
| B. Python dependency hygiene: unpinned/unhashed requirements and unexpected `.pth` startup files (agent-framework, 17-11) | 4 | 5 | 3 | 3 | 15 |
| C. npm install-script classifier from `npm query ":attr(scripts, [postinstall])"` | 3 | 3 | 4 | 3 | 13 |
| D. WordPress IoC checker for the Rank Math PRO 3.0.123 incident | 4 | 3 | 4 | 3 | 14 (Tuesday lane) |
| E. Git history cleanup planner | 3 | 2 | 4 | 3 | 12 (GitHub's guide already covers it; overlaps experiment 104) |

**Winner: A.** Two scouts arrived at it independently (Docker layers and public web folders from the pain scout; ignore-file gaps from the existing-tools scout). The gap: the tools that exist scan contents (gitleaks, trufflehog, detect-secrets) or test one pattern syntax (gitignore testers). None of them answers "which of my files will this ignore file let through, to which destination", and none explains the three traps the docs reveal: an `.npmignore` silently replaces `.gitignore`; a `.dockerignore` line without `**/` only covers the root; a `.gitignore` line does nothing for a file already committed. It works on passive input (a file list), so it also fits the weekly report. B is the runner-up for a future Friday; D goes to the Tuesday lane if it is still relevant.
