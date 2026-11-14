# Saturday OSS — yfinance install docs fix

The yfinance page "install without curl_cffi" told users to download a `requirements.txt` that no longer exists; this contribution replaces it with two commands that work.

En español: la documentación de yfinance para instalarlo sin `curl_cffi` descargaba un archivo que ya no existe y dejaba la instalación rota. Esta contribución la reemplaza por dos comandos que funcionan, comprobados en un entorno limpio.

**Pull request:** https://github.com/ranaroussi/yfinance/pull/3045 (against `dev`, opened 2026-11-14)

## The problem
`doc/source/advanced/install.rst` (published at https://ranaroussi.github.io/yfinance/advanced/install.html) said:

```bash
curl -fsSL https://raw.githubusercontent.com/ranaroussi/yfinance/main/requirements.txt | grep -vi '^curl_cffi' | pip install -r /dev/stdin
pip install --no-deps yfinance
```

`requirements.txt` was removed when dependencies moved to `pyproject.toml`, so `curl` gets a 404, nothing is installed, and the second line installs yfinance **without** pandas, numpy or requests.

## The fix
```bash
pip install yfinance
pip uninstall -y curl_cffi
```
yfinance already falls back to `requests` when `curl_cffi` is missing (`yfinance/_http.py`). Diff: [`change.patch`](change.patch) — 2 lines in one file.

## Verification
Clean virtual environments, before and after: see [`test-log.txt`](test-log.txt). Before: `ModuleNotFoundError: No module named 'numpy'`. After: `HAS_CURL_CFFI = False`, backend `requests`, `yf.Ticker('MSFT')` constructs fine; `pip check` flags curl-cffi as missing, which is expected and stated in the PR.

## Why this one
Francisco's `financial-bot` uses yfinance. Candidate selection, scoring and the projects ruled out are in [`RESEARCH.md`](RESEARCH.md). PR text: [`pr-body.md`](pr-body.md). Contribution notes: [`CONTRIBUTION.md`](CONTRIBUTION.md).

## Limitations
Tested on Windows 11 with Python 3.13 only. The PR may be changed or declined by the maintainers; this folder records what was sent, not the outcome.

---
Daily Security Lab · Experiment 098 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
