# Gatehouse 1.1

Audit your GitHub Actions workflows for pwn requests, script injection, cache/artifact poisoning and unpinned actions — one file, zero dependencies, nothing leaves your machine.

> **1.1 (Experiment 088, maintenance release of Experiment 087):** five new rules — GH012 cache poisoning, GH013 artifact poisoning, GH014 unsafe commands, GH015 secrets in scripts, GH016 workflow inputs in scripts — plus 7 new tests and fixtures. All 087 behaviour is unchanged.

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

### New in 1.1 — sample run

```text
$ node gatehouse.js fixtures/vulnerable/privileged-extras.yml fixtures/vulnerable/dispatch.yml --fail-on never
HIGH     GH012  fixtures/vulnerable/privileged-extras.yml:14
         Cache used in a privileged workflow (cache poisoning)
         actions/cache in a privileged workflow (workflow_run)
         > - uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830
         fix: Do not restore or save caches in privileged workflows that handle untrusted input; build and cache only in the unprivileged pull_request workflow.

HIGH     GH013  fixtures/vulnerable/privileged-extras.yml:18
         workflow_run downloads artifacts from an untrusted run
         artifact from the triggering workflow run is consumed with write-capable token/secrets
         > - uses: actions/download-artifact@fa0a91b85d7a8f6a62b6e2f6a5d6f6a5d6f6a5d6
         fix: Treat artifact contents strictly as data: validate with an allow-list, never execute them, never use their text in run: or GITHUB_ENV, and pin the run id you trust.

MEDIUM   GH014  fixtures/vulnerable/privileged-extras.yml:9
         Deprecated unsafe workflow commands re-enabled
         unsafe set-env / add-path commands re-enabled
         > ACTIONS_ALLOW_UNSECURE_COMMANDS: true
         fix: Remove the variable and use the $GITHUB_ENV / $GITHUB_PATH files with validated values.

MEDIUM   GH015  fixtures/vulnerable/privileged-extras.yml:22
         Secret interpolated directly into a script
         ${{ secrets.DEPLOY_TOKEN }} is expanded into the script text
         > run: ./deploy.sh --token ${{ secrets.DEPLOY_TOKEN }}
         fix: Map the secret to an env var on the step (env: { TOKEN: ${{ secrets.TOKEN }} }) and use "$TOKEN".

MEDIUM   GH016  fixtures/vulnerable/dispatch.yml:14
         Workflow input interpolated into script
         ${{ inputs.version }} is a free-text input expanded into the script
         > - run: echo "Releasing ${{ inputs.version }}"
         fix: Pass the input through an env var and quote it: env: { NAME: ${{ inputs.name }} } then "$NAME"; or use type: choice.
```

## Run it

```bash
node gatehouse.js .            # scans ./.github/workflows (or any dir/file of YAML)
node gatehouse.js . --sarif > gatehouse.sarif   # upload to GitHub code scanning
node gatehouse.js . --fail-on critical          # CI gate (default: high; exit 1 on hit)
node gatehouse.js --rules ; node gatehouse.js --explain GH001
npm test                       # 21 tests, no install needed
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
| GH012 | high | `actions/cache` or setup-* `cache:` in `pull_request_target`/`workflow_run` (cache poisoning) |
| GH013 | high | `workflow_run` downloads artifacts from the triggering (possibly fork) run |
| GH014 | medium | `ACTIONS_ALLOW_UNSECURE_COMMANDS: true` |
| GH015 | medium | `${{ secrets.X }}` expanded inside `run:`/`script:` instead of an env var |
| GH016 | medium | `${{ inputs.* }}` / `github.event.inputs.*` expanded inside `run:`/`script:` |

`fixtures/vulnerable/` vs `fixtures/fixed/` show every pattern side by side; the tests prove the fixed versions are clean.

## Why it exists

2026 saw automated campaigns (hackerbot-claw in Feb, prt-scan in spring) mass-exploiting `pull_request_target` misconfigurations, on top of the 2025 tj-actions tag-repointing incident. Mature tools exist (zizmor, actionlint, poutine); Gatehouse is the "drop one file in, no install, readable rule logic" option you can read in ten minutes and vendor into a repo.

## Limitations

- 1.1 additions: GH012/GH013 are trigger-based heuristics (any cache or artifact download in a privileged workflow is flagged, even if the cached data is never executed) — review and use `# gatehouse-ignore: GH012` when justified. GH016 treats `inputs.*` as untrusted even though only users with write access can dispatch; it is `medium` for that reason.

- It is a **line-oriented scanner, not a YAML parser**. Exotic formatting (anchors, flow-style steps, deeply re-indented blocks) can cause misses; it will not follow reusable workflows or composite actions into other files.
- Expression analysis is pattern-based: it flags known attacker-controlled contexts, not data-flow through step outputs.
- No network: it cannot tell you whether a pinned SHA is genuine or an action is compromised.
- Complements, does not replace, zizmor/actionlint; absence of findings is not proof of safety.

Built by an AI agent directed by Francisco Reyes (farp.dev)

---
Daily Security Lab · Experiment 088 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
