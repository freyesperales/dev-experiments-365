# Lockjaw

Audit your `package-lock.json` for supply-chain red flags — and review lockfile diffs in PRs — with one offline, dependency-free file.

```text
$ node lockjaw.js fixtures/suspicious-lock.json --package-json fixtures/package.json
scanned 9 packages in fixtures/suspicious-lock.json
HIGH     LJ001  internal-utils@2.1.0
         Package resolved from an unexpected registry/host
         > packages.evil-mirror.example (https://packages.evil-mirror.example/internal-utils/-/internal-utils-2.1.0.tgz)
         fix: Dependency confusion and tarball swapping both hide here. Pin to your registry or remove the override.
HIGH     LJ002  left-pad@1.3.0
         Package has no integrity hash
         > https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz
         fix: Without integrity, npm cannot verify the tarball. Regenerate the lockfile from a trusted registry (npm install --package-lock-only).
HIGH     LJ003  oldlib@0.1.0
         Dependency fetched over plain http://
         > http://registry.npmjs.org/oldlib/-/oldlib-0.1.0.tgz
         fix: Anyone on the path can swap the tarball. Use https and re-lock.
HIGH     LJ006  swapped@1.0.0
...
11 finding(s): 0 critical, 6 high, 4 medium, 1 low

$ node lockjaw.js diff fixtures/old-lock.json fixtures/new-lock.json
+1 added, -1 removed, ~2 changed
CRITICAL a@1.0.0
         SAME VERSION, DIFFERENT INTEGRITY — tarball content changed without a version bump
HIGH     b@1.0.1
...
4 finding(s): 1 critical, 2 high, 1 medium, 0 low
```

## Run it

```bash
node lockjaw.js package-lock.json                    # audit (exit 1 on high+; --fail-on critical|high|medium|low)
node lockjaw.js package-lock.json --package-json package.json   # also detect lockfile drift
node lockjaw.js package-lock.json --registry npm.mycorp.example # allow your private registry
node lockjaw.js package-lock.json --sarif > lockjaw.sarif       # GitHub code scanning
git show origin/main:package-lock.json > /tmp/old.json
node lockjaw.js diff /tmp/old.json package-lock.json            # PR review: only what this change introduced
npm test
```

Supports lockfileVersion 1, 2 and 3. Node 18+. No network access, ever.

## Rules

| ID | Sev | What |
|---|---|---|
| LJ001 | high | Resolved from a host other than the npm registry (dependency confusion / mirror swap) |
| LJ002 | high | Registry tarball without integrity hash |
| LJ003 | high | Fetched over plain `http://` |
| LJ004 | medium | git/URL dependency not pinned to a 40-char commit |
| LJ005 | low | Weak `sha1` integrity |
| LJ006 | high | Tarball URL names a different package than the lockfile key |
| LJ007 | medium | Package runs install scripts |
| LJ008 | medium | Name one edit away from a popular package (typosquat hint) |
| LJ009 | medium | `file:`/`link:` dependency |
| LJ010 | high | `package.json` vs lockfile drift (with `--package-json`) |
| LJ011 | medium | Same package locked at 4+ versions |

`diff` mode adds: **same version but different integrity** (critical — tarball changed without a version bump), resolved-URL change at the same version, and a package that newly gained an install script.

## Why it exists

Recent npm worms and token-theft campaigns spread through install scripts and swapped tarballs, and the one file that records exactly what CI will install — the lockfile — is the one reviewers skip because the diff is thousands of lines. Lockjaw reads it for you, locally, with no account and no registry calls. See `RESEARCH.md`.

## Limitations

- It inspects lockfile *metadata*; it does not download tarballs, check vulnerability databases or know whether a package is actually malicious. A clean report is not proof of safety.
- Typosquat check uses a small built-in list of ~40 popular names and edit distance 1; expect misses and the odd false positive.
- Install-script detection needs lockfileVersion 2/3 (`hasInstallScript`); v1 lockfiles don't record it.
- npm only (no yarn.lock / pnpm-lock.yaml yet).
- Private-registry users must pass `--registry` or LJ001 will fire.

## Sample run

Test suite: E
echo "$TESTS (all green)."
cat <<'E'

---
Daily Security Lab · Experiment 089 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
