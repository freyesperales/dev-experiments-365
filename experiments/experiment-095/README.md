# Gatehouse 1.2

Audit your GitHub Actions workflows for pwn requests, script injection, cache/artifact poisoning and unpinned actions. One file, zero dependencies, and now a browser demo where nothing leaves your machine.

En español: revisa tus workflows de GitHub Actions en busca de patrones riesgosos (inyección de scripts, acciones sin fijar, permisos excesivos). La versión 1.2 agrega una demo en el navegador: pegas el YAML y nada se sube.

**Live demo (paste a workflow, runs in your browser):** https://freyesperales.github.io/dev-experiments-365/experiments/experiment-095/

**New in 1.2** (maintenance release of Experiments 087/088, research blocked this run, see RESEARCH.md): browser demo `index.html` using the same engine; pure `auditFiles()` API; the engine loads without `fs`/`path` in a browser; 3 new tests (24 total). No rule changes.

## Sample run

```text
$ node gatehouse.js fixtures/vulnerable
...
21 finding(s) in 4 file(s): 1 critical, 10 high, 9 medium, 1 low

$ node gatehouse.js fixtures/fixed
gatehouse: 3 workflow file(s) scanned — no findings.      (exit code 0)
```

Demo page, "Load sample" button, headless-checked: 4 findings, first one `CRITICAL GH001 Privileged trigger checks out untrusted PR code`, no console errors.

## Run

```sh
node gatehouse.js [path...] [--json | --sarif] [--fail-on critical|high|medium|low|never] [--rules] [--explain GH001]
npm test        # 24 tests, node:test, no install step
```

Needs Node 18+. Exit codes: `0` ok, `1` findings at/above `--fail-on` (default `high`), `2` usage error.

## Who it is for

Anyone who keeps a website, shop theme or internal tool in GitHub and lets Actions build or deploy it. If you are not a developer, send the demo link to whoever maintains your repository.

## Why it exists

Workflows run with secrets and a write token, and a few common patterns let an outside pull request use that power. See `RESEARCH.md` for what could and could not be verified in this run.

## Limitations

- Line-oriented heuristics, not a full YAML parser; false positives and misses are possible. A clean result is not a guarantee.
- Rules were not re-checked against current GitHub documentation in this run (network blocked).

---
Daily Security Lab · Experiment 095 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
