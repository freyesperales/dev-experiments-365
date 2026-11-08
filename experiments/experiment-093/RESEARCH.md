# Research notes — Experiment 093

**Lane:** Sunday / maintenance. Nothing in the existing toolset (Gatehouse, Lockjaw, Blindspot) had an obvious high-value patch right after Lockjaw 1.1 yesterday, so the fallback applied: a small new Monday-type defensive tool.

**Honesty note:** this run had no live web research (the scout/judge step was done from background knowledge, not fresh sources, and no links are fabricated). Claims below are general and should be verified before being quoted.

## Demand evidence (background knowledge)
- Rules-file prompt-injection with invisible Unicode ("Rules File Backdoor", Pillar Security, 2025) is a documented technique against AI code editors.
- Multiple coding-agent tools have fixed issues where an untrusted repo's project config (MCP servers, hooks, base URLs) could run commands or redirect traffic before the user approved anything.
- Unpinned `npx -y` MCP servers are the default copy-paste install in most MCP READMEs.

## Shortlist and scores (usefulness × freshness × feasibility × shareability, 1–5 each)
| Candidate | U | F | Fe | S | Total |
|---|---|---|---|---|---|
| **Agent-config auditor (Leashcheck)** | 5 | 5 | 5 | 4 | **19 — chosen** |
| Dockerfile/compose hardening linter | 4 | 2 | 4 | 3 | 13 — crowded (hadolint, trivy) |
| Gatehouse 1.2 (more Actions rules) | 3 | 3 | 5 | 2 | 13 — same theme as last 10 entries |
| security.txt / headers checker | 3 | 2 | 5 | 3 | 13 — many existing tools |

## What exists and falls short
General secret scanners and SAST tools do not parse `.mcp.json`, Claude Code settings or rules files, and ignore invisible-Unicode risk in Markdown. Leashcheck is narrow on purpose: one offline file, agent config only.
