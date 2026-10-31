# Gatehouse

Audit your GitHub Actions workflows for pwn requests, script injection and unpinned actions — one file, zero dependencies, nothing leaves your machine.

```text
$ node gatehouse.js fixtures/vulnerable
CRITICAL GH001  fixtures/vulnerable/pwn-request.yml:12
         Privileged trigger checks out untrusted PR code
         privileged trigger (pull_request_target) checks out the PR head
         > ref: ${{ github.event.pull_request.head.sha }}
         fix: Do not check out PR head in privileged workflows. Split into an unprivileged pull_request workflow (build/test) and a privileged one that only consumes artifacts as data.

HIGH     GH006  fixtures/vulnerable/misc.yml:3
         Overly broad permissions (write-all)
         permissions: write-all
         > permissions: write-all
         fix: List only the scopes the job needs.

HIGH     GH010  fixtures/vulnerable/misc.yml:6
         Self-hosted runner reachable from pull_request triggers
...
15 finding(s) in 2 file(s): 1 critical, 8 high, 5 medium, 1 low
```

## Run it

```bash
node gatehouse.js .            # scans ./.github/workflows (or any dir/file of YAML)
node gatehouse.js . --sarif > gatehouse.sarif   # upload to GitHub code scanning
node gatehouse.js . --fail-on critical          # CI gate (default: high; exit 1 on hit)
node gatehouse.js --rules ; node gatehouse.js --explain GH001
npm test                       # 14 tests, no install needed
```
Requires Node 18+. Suppress a reviewed finding with `# gatehouse-ignore: GH003` on the line or the line above.

## Rules

| ID | Sev | What |
|---|---|---|
| GH001 | critical | `pull_request_target`/`workflow_run` checking out PR head |
| GH002 | high | Attacker-controlled `${{ }}` (PR title, branch, comment…) inside `run:`/`script:` |
| GH003 | high | Third-party action/workflow/docker image not pinned to SHA/digest |
| GH004 | medium | First-party (`actions/*`) not pinned to SHA |
| GH005 | medium | No `permissions:` anywhere |
| GH006 | high | `permissions: write-all` |
| GH007 | high | `secrets: inherit` / `toJSON(secrets)` |
| GH008 | high | Untrusted data written to `GITHUB_ENV`/`PATH`/`OUTPUT` |
| GH009 | medium | `curl … \| bash` |
| GH010 | high | Self-hosted runner on fork-reachable triggers |
| GH011 | low | Checkout keeps credentials while artifacts are uploaded |

`fixtures/vulnerable/` vs `fixtures/fixed/` show every pattern side by side; the tests prove the fixed versions are clean.

## Why it exists

2026 saw automated campaigns (hackerbot-claw in Feb, prt-scan in spring) mass-exploiting `pull_request_target` misconfigurations, on top of the 2025 tj-actions tag-repointing incident. Mature tools exist (zizmor, actionlint, poutine); Gatehouse is the "drop one file in, no install, readable rule logic" option you can read in ten minutes and vendor into a repo.

## Limitations

- It is a **line-oriented scanner, not a YAML parser**. Exotic formatting (anchors, flow-style steps, deeply re-indented blocks) can cause misses; it will not follow reusable workflows or composite actions into other files.
- Expression analysis is pattern-based: it flags known attacker-controlled contexts, not data-flow through step outputs.
- No network: it cannot tell you whether a pinned SHA is genuine or an action is compromised.
- Complements, does not replace, zizmor/actionlint; absence of findings is not proof of safety.

Built by an AI agent directed by Francisco Reyes (farp.dev)

---
Daily Security Lab · Experiment 087 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
