# stacklens

See your stacked-PR branch chain, spot which branches drifted, and get the exact rebase commands — one zero-dependency, read-only command.

> Built by the daily routine on 2026-10-17; published on 2026-10-22 because the push failed (GitHub access). Reconstructed from the run's own event log.

```
$ stacklens
main (trunk)
└─ auth-schema  +2 -1  ⚠ needs rebase  (no upstream)
      ↳ trunk moved 1 commit ahead
   └─ auth-api  +2 -1  ⚠ needs rebase  (no upstream)
         ↳ parent "auth-schema" was rewritten or advanced (1 commit not in this branch)
      ├─ auth-docs  +1  ⚠ needs rebase  (no upstream)
      │     ↳ parent "auth-api" will be rebased first
      └─ auth-ui  +2  ⚠ needs rebase  (no upstream)
            ↳ parent "auth-api" will be rebased first

4 branches need rebasing. Run `stacklens --plan` for the commands.
```

`stacklens --plan` prints a reviewable shell script (`git rebase --onto <parent> <old-base> <branch>`, parents first); after running it the same repo reads `Stack is in order.` (see Sample run). `stacklens --html stack.html` writes a self-contained interactive diagram — [`demo.html`](demo.html) is one.

## Install / run

```sh
node bin/stacklens.js            # from this folder, inside any git repo: use -C <dir>
npm link                         # optional: puts `stacklens` on your PATH
```

Needs Node ≥ 18 and `git`. No dependencies, no network, no accounts, no metadata files.

| Flag | Effect |
|---|---|
| `--plan` | print the restack script (refuses to run on a dirty tree, returns you to your starting branch) |
| `--html FILE` | self-contained SVG view with a copy-script button, light/dark |
| `--json` | machine-readable analysis |
| `--check` | exit 1 if anything needs rebasing (pre-push hook / CI) |
| `--trunk REF` | override trunk (default: `origin/HEAD`, then main/master/trunk/develop) |

## Why it exists

Stacked PRs are how people ship big changes in reviewable slices, but the tooling is either a paid service with accounts (Graphite) or a metadata system you must adopt up front (git-branchless, gh-stack). [lazygit#2527](https://github.com/jesseduffield/lazygit/issues/2527) ("Stacked PRs in lazygit", 43 reactions) is the author trying several of them because none fit. The painful moment is always the same: you amended branch 1 after review and now branches 2–5 sit on a commit that no longer exists. stacklens needs no setup: it infers the stack from git's own data.

How: for each branch it picks the parent whose tip it contains (fewest extra commits wins); if the parent was rewritten, `git merge-base --fork-point` (reflog) finds where the branch really forked, so it stays attached to the *rewritten* parent instead of falling to trunk. Branches already merged (fast-forward, or every patch already in trunk via `git cherry`) are hidden. Drift cascades: if a parent will be rebased, so will every descendant.

## Sample run

Produced by `node bin/stacklens.js` on a throwaway repo (main moved, `auth-schema` amended, a 4-branch stack above it):

```
$ stacklens --plan | sh
$ stacklens
main (trunk)
└─ auth-schema  +2  ✓  (no upstream)
   └─ auth-api  +1  ✓  (no upstream)
      ├─ auth-docs  +1  ✓  (no upstream)
      └─ auth-ui  +2  ✓  (no upstream)

Stack is in order.
```

Tests: `npm test` → 9 tests, all pass (they build real temp repos, execute the generated plan, and re-analyse the result).

## Limitations

- **Reflog-dependent.** Detecting a *rewritten* parent relies on the local reflog (`--fork-point`). On a fresh clone, or after `git reflog expire`/gc, a rewritten parent can look like an unrelated branch and the child falls back to trunk.
- **Squash merges are not detected** (the squashed commit has a different patch-id); such a branch stays listed until you delete it.
- Ambiguous topologies (two branches at the same tip) are annotated, not resolved. Parent choice is "fewest commits on top", which can differ from your intent.
- It only looks at local branches and never fetches; run `git fetch` first if you care about `origin/main`. Rebase conflicts are for you to resolve; the script stops at the first one (`set -e`).
- The plan is not executed for you by design. Worktree-checked-out branches may refuse to rebase.

---
Development Experiment 076 of dev-experiments-365
