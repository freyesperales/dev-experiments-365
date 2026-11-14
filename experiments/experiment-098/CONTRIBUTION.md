# Contribution notes — 098

- Target repo: https://github.com/ranaroussi/yfinance (base branch `dev`)
- Fork: https://github.com/freyesperales/yfinance, branch `docs-fix-install-without-curl-cffi`
- PR: https://github.com/ranaroussi/yfinance/pull/3045
- PR title: docs: fix install-without-curl_cffi instructions (requirements.txt was removed)
- Commit author: Francisco Reyes, with `Co-Authored-By: Claude` trailer
- Problem: documented install command downloads a removed file (404) and leaves yfinance without its dependencies.
- Reproduction: `test-log.txt` (fails before, works after).
- Status: submitted. Next Saturday: check whether maintainers asked for changes before opening anything new.
