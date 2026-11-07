# Lockjaw 1.1

Audit your `package-lock.json` **or `yarn.lock`** for supply-chain red flags — and review lockfile diffs in PRs — with one offline, dependency-free file.

```text
$ node lockjaw.js fixtures/yarn-suspicious.lock --package-json fixtures/yarn-package.json
scanned 7 packages in fixtures/yarn-suspicious.lock
HIGH     LJ001  evil-mirror-dep@2.1.0
         Package resolved from an unexpected registry/host
         > packages.evil-mirror.example (https://packages.evil-mirror.example/evil-mirror-dep/-/...)
HIGH     LJ003  plain-http@1.0.0
         Dependency fetched over plain http://
HIGH     LJ006  swapped@1.0.0
         > key says "swapped" but URL downloads "something-else"
HIGH     LJ010  left-out
         > dependencies: "left-out": "^1.0.0" has no yarn.lock entry for "left-out@^1.0.0"
...
10 finding(s): 0 critical, 7 high, 2 medium, 1 low

$ node lockjaw.js diff fixtures/yarn-old.lock fixtures/yarn-new.lock
+1 added, -0 removed, ~1 changed
CRITICAL a@1.0.0
         SAME VERSION, DIFFERENT INTEGRITY — tarball content changed without a version bump
HIGH     LJ001  fresh@1.0.0
         Package resolved from an unexpected registry/host
2 finding(s): 1 critical, 1 high, 0 medium, 0 low
```

## What's new in 1.1 (Experiment 092, maintenance release of Experiment 089)

- **Yarn Classic (v1) `yarn.lock` support**, auto-detected — audit and `diff` both work. Multi-spec entries, scoped names, git deps and legacy sha1-only entries (Yarn < 1.10, reported as LJ005 instead of a false "missing integrity") are handled.
- **Spec-based drift check (LJ010) for yarn**: every `package.json` range must have a matching `name@range` entry, which is what `yarn install --frozen-lockfile` enforces.
- **Yarn Berry (v2+)** files get a clear "not supported yet" error (exit 2) instead of a confusing crash.
- **`--no-dup`** flag exposed on the CLI (the option existed in the library but was unreachable).
- Removed dead code; 27 tests (was 16).

## Run it

```bash
node lockjaw.js package-lock.json                    # audit (exit 1 on high+; --fail-on critical|high|medium|low)
node lockjaw.js yarn.lock --package-json package.json   # Yarn Classic + drift detection
node lockjaw.js package-lock.json --registry npm.mycorp.example # allow your private registry
node lockjaw.js package-lock.json --sarif > lockjaw.sarif       # GitHub code scanning
git show origin/main:yarn.lock > /tmp/old.lock
node lockjaw.js diff /tmp/old.lock yarn.lock                    # PR review: only what this change introduced
npm test
```

Supports package-lock lockfileVersion 1, 2, 3 and Yarn Classic v1. Node 18+. No network access, ever.

## Rules

| ID | Sev | What |
|---|---|---|
| LJ001 | high | Resolved from a host other than the npm/yarn registry (dependency confusion / mirror swap) |
| LJ002 | high | Registry tarball without integrity hash |
| LJ003 | high | Fetched over plain `http://` |
| LJ004 | medium | git/URL dependency not pinned to a 40-char commit |
| LJ005 | low | Weak `sha1` integrity |
| LJ006 | high | Tarball URL names a different package than the lockfile key |
| LJ007 | medium | Package runs install scripts (package-lock v2/3 only) |
| LJ008 | medium | Name one edit away from a popular package (typosquat hint) |
| LJ009 | medium | `file:`/`link:` dependency |
| LJ010 | high | `package.json` vs lockfile drift (with `--package-json`) |
| LJ011 | medium | Same package locked at 4+ versions (silence with `--no-dup`) |

`diff` mode adds: same version but different integrity (critical), resolved-URL change at the same version, and a package that newly gained an install script.

## Why it exists

Npm worms and token-theft campaigns spread through install scripts and swapped tarballs, and the one file that records exactly what CI will install — the lockfile — is the one reviewers skip because the diff is thousands of lines. Lockjaw 1.0 only read `package-lock.json`; a large share of JS projects still use Yarn Classic, so 1.1 closes that gap. See `RESEARCH.md`.

## Limitations

- Lockfile *metadata* only: no tarball download, no vulnerability database, no malice detection. A clean report is not proof of safety.
- Typosquat check uses a ~40-name built-in list and edit distance 1; expect misses and odd false positives.
- Install-script detection needs package-lock v2/3 (`hasInstallScript`); neither v1 nor yarn.lock records it.
- Yarn `diff` keys entries by `name@version`, so a version bump shows as added + removed rather than "changed"; same-version integrity swaps are still caught.
- Yarn Berry (v2+) and pnpm-lock.yaml are not supported yet.
- Private-registry users must pass `--registry` or LJ001 will fire.

## Sample run

Test suite: # tests 27 # pass 27 # fail 0  (all green, `npm test`, Node v22.23.4).

---
Daily Security Lab · Experiment 092 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
