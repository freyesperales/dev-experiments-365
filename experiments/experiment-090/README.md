# Blindspot

Check your repos for the Next.js image-optimizer RCE (GHSA-2xp9-vwfh-vxw4) that `npm audit` may not tell you about — offline, zero dependencies, one command.

## Demo

```
$ node blindspot.js fixtures/vuln
Blindspot — GHSA-2xp9-vwfh-vxw4 (Next.js Image Optimization API RCE)
target: fixtures/vuln
  VULN next@15.5.20  [package-lock.json] → upgrade to >= 15.5.24
  hint (next.config.js): remote image sources allowed — wider attacker-reachable input surface for the optimizer

Advisory: https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4
Upstream: https://github.com/strukturag/libheif/security/advisories/GHSA-g89c-p67h-r497
Remediate: upgrade next to 15.5.24 (15.x line) or 16.3.3+ (16.x line), then redeploy.
Note: no CVE and (as of 2026-09-03) not in the global GitHub Advisory DB/OSV — npm audit may stay silent.
exit 1
```

## Run

```
node blindspot.js [--json] [dir ...]     # exit 1 = vulnerable, 0 = ok, 2 = error
npm test                                   # 12 tests
```

Reads `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock` (classic + berry), `pnpm-lock.yaml` and `node_modules/next`. Never uses the network. Use it in CI: a non-zero exit fails the job.

## The advisory (public, patched)

- **ID:** GHSA-2xp9-vwfh-vxw4 — "Unauthenticated Remote Code Execution in Image Optimization API when AVIF files are used". No CVE assigned.
- **Severity:** Critical, CVSS v4 9.5. Published 2026-08-25 as a repository advisory on vercel/next.js.
- **Affected:** `next` >= 10.0.0 and < 15.5.24, and < 16.3.3 on the 16.x line.
- **Fixed:** 15.5.24 and 16.3.3.
- **Upstream reference:** libheif GHSA-g89c-p67h-r497.
- **Who is affected:** apps running the built-in image optimizer (`next start`/self-hosted/containers). Static exports and custom loaders likely don't use it — Blindspot prints heuristic hints, but treat upgrading as the fix.
- **Remediate:** upgrade `next`, redeploy, then rebuild containers.

## Why it exists

On 2026-09-03 [advisory-database#9324](https://github.com/github/advisory-database/issues/9324) reported that this Critical advisory returned 404 on the global advisory page and OSV, and was not returned by the advisories API — so `npm audit`/Dependabot-style tools had nothing to match. A version-range check against a lockfile needs no database. Check the issue for whether this has since been ingested.

## Limitations

- Version-based only: it does not prove exploitability or test your running server, and ships no exploit.
- The advisory text available to me did not describe the technical flaw; I did not verify details beyond the advisory metadata. The 16.x lower bound is read from "< 16.3.3"; 16.0.0 is treated as affected.
- Config hints are regex heuristics, not a parser.
- Does not follow monorepo workspaces automatically; pass each directory.
- Version data was taken from a GitHub issue quoting the advisory — confirm against the advisory page.

---
Daily Security Lab · Experiment 090 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
