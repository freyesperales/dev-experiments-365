# Research — Experiment 097 (Thursday: AI agents)

Date of run: 2026-11-12. This run had working web access (WebSearch + WebFetch from the owner's PC).
Three research scouts ran in parallel (rising issues, defender pain, existing tools), then the main
agent re-opened the primary sources it relied on. Every link below was opened in this run.

## A. Sources opened and checked by the main agent (accessed 2026-11-12)

| # | Type | URL | Source date | Takeaway |
|---|------|-----|-------------|----------|
| 1 | primary (vendor research) | https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks | 2025-04-01 | Tool poisoning: an innocent `add` tool hid instructions in an `<IMPORTANT>` block telling the model to read `~/.cursor/mcp.json` and `~/.ssh/id_rsa`, pass them through a `sidenote` parameter, and not tell the user. Mitigations: show full descriptions, pin tools with a hash/checksum to catch "rug pulls". |
| 2 | primary (spec) | https://modelcontextprotocol.io/specification/2025-06-18/server/tools | spec version 2025-06-18 | `tools/list` returns `name`, `title`, `description`, `inputSchema`, `outputSchema`, `annotations`; servers can announce `notifications/tools/list_changed`; clients MUST treat annotations as untrusted unless the server is trusted; clients SHOULD show which tools are exposed to the model. |
| 3 | primary (spec) | https://modelcontextprotocol.io/specification/draft/basic/security_best_practices | draft, no date | Lists MCP attacks (confused deputy, token passthrough, SSRF, local server compromise, OAuth URL schemes, scope minimization). It does not cover tool-description poisoning, so clients and users are on their own for that. |
| 4 | primary (advisory) | https://github.com/advisories/GHSA-jm63-cq47-j5jp | 2026-10-15 (in DB 2026-10-20) | `@modelcontextprotocol/server` 2.0.0–2.2.0 could route responses to the wrong client on a shared HTTP transport (CVE-2026-111770, fixed 2.3.0). Shows MCP is an active advisory area this month; not what Toolprint checks. |
| 5 | primary (competitor repo) | https://github.com/invariantlabs-ai/mcp-scan (now `snyk/agent-scan`) | no date | The best-known MCP scanner now needs a Snyk account and `SNYK_TOKEN`, and sends tool names and descriptions to its API (secrets redacted). Installed with `uvx` or a binary. README does not mention pinning/hashing. |
| 6 | primary (researcher) | https://embracethered.com/blog/posts/2024/hiding-and-finding-text-with-unicode-tags/ | 2024-01-14 | Unicode Tag characters mirror ASCII, are usually not rendered, but LLMs read them; recommends filtering Tag code points. (The page itself contains hidden tag text aimed at AI readers: treated as data.) |
| 7 | primary (vendor research) | https://www.microsoft.com/en-us/security/blog/2026/09/03/ascii-smuggling/ | 2026-09-03 | Tags block U+E0000–U+E007F now used in phishing too; England/Scotland/Wales flag emoji are the legitimate use and caused false positives until excluded; "normalize before you match", also upstream of AI ingestion. Toolprint excludes valid flag sequences (covered by a test). |
| 8 | primary (tool docs) | https://raw.githubusercontent.com/modelcontextprotocol/inspector/main/clients/cli/README.md | no date | Official way to get the input: `npx @modelcontextprotocol/inspector --cli node build/index.js --method tools/list` (stdio) or with an `https://…/mcp` URL (remote). Used in the README "how to get your tools list". |
| 9 | primary (tool docs) | https://github.com/modelcontextprotocol/inspector | no date | Inspector has a CLI mode for automation and CI; points to the CLI README above. |

### Second research loop (after the depth gate flagged a 9-minute run)

| # | Type | URL | Source date | Takeaway |
|---|------|-----|-------------|----------|
| 19 | primary (spec) | https://modelcontextprotocol.io/specification/2025-11-25/server/tools | spec version 2025-11-25 | Tool gains `icons` and `execution` (`taskSupport`); tool names SHOULD be 1–128 chars of `A-Z a-z 0-9 _ - .`, case-sensitive, unique per server. Changed the tool: fingerprint now covers `icons` and `execution`; new `name_lookalike`, `name_format` and `icon_url` rules. |
| 20 | primary (spec) | https://modelcontextprotocol.io/specification/draft/server/tools | draft, no date | Adds `x-mcp-header` (parameter mirrored into an `Mcp-Param-*` HTTP header); servers SHOULD NOT mark passwords, API keys, tokens or PII with it; clients MUST drop tools whose header name is invalid; clients aggregating several servers SHOULD disambiguate colliding names. Changed the tool: new `header_secret` and `header_invalid` rules. |

## B. Sources opened by the research scouts in this run (accessed 2026-11-12, not re-opened by the main agent)

| # | URL | Source date | Takeaway |
|---|-----|-------------|----------|
| 10 | https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-tool-description-poisoning-20260711-cs/ | 2026-07 | Secondary: recommends diffing tool descriptions between versions and requiring re-approval when they change. Benchmark figures there are lab numbers, not incident data; not quoted in the tool. |
| 11 | https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-transport-trust-gap-20261109-csa-style/ | 2026-11-09 | Secondary: groups recent MCP SDK CVEs (local servers reachable from the browser, unbound OAuth issuer, cross-client leaks). Candidate for a future tool (SDK version checker). |
| 12 | https://github.com/eclipse-theia/theia/issues/16892 | 2026-01-27 (closed 2026-04-28) | Primary issue: an AI chat rendered external markdown images, enabling data exfiltration; fix partly reverted. Basis for the "markdown image with query string" rule. |
| 13 | https://simonwillison.net/2024/Jun/16/github-copilot-chat-prompt-injection/ | 2024-06-16 | Markdown-image exfiltration pattern; GitHub blocked images to untrusted domains. |
| 14 | https://github.com/riseandignite/mcp-shield | no date | Alternative scanner; runs with `npx` (needs Node), optional Claude-key analysis. |
| 15 | https://github.com/protectai/rebuff | archived 2025-05-16 | Prompt-injection detector, needs OpenAI + Pinecone keys; archived. |
| 16 | https://github.com/protectai/llm-guard | archived 2026-07-09 | Python 3.9+; no longer maintained. |
| 17 | https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M | no date | Classifier covers Spanish but download requires registration with legal name and birth date. |
| 18 | https://news.ycombinator.com/item?id=47689822 | no exact date | One-comment thread: semantic prompt-injection detection gives false positives and misses non-English text. Supports keeping Toolprint to verifiable signals. |

## Candidates and JUDGE (1–5 each: usefulness to a small business × freshness × feasibility in one run × shareability)

| Candidate | Use | Fresh | Feasible | Share | Total |
|---|---|---|---|---|---|
| **A. Toolprint — paste `tools/list`, flag poisoning signals, fingerprint each tool, diff against your approved copy** | 4 | 4 | 5 | 4 | **320** |
| B. MCP OAuth metadata validator (schemes, private IPs, wildcard scopes) — sources 3, 11 | 3 | 5 | 4 | 3 | 180 |
| C. MCP SDK version checker against recent CVEs — sources 4, 11 | 3 | 5 | 4 | 3 | 180 |
| D. Hidden-text revealer for pasted HTML/email before giving it to an assistant — sources 6, 7, 12 | 4 | 3 | 4 | 4 | 192 |

Winner: **A**. Reasons: all three scouts independently pointed at it; the leading scanner (source 5) needs an account
and sends descriptions to a third party, and its README does not mention pinning, while source 1 recommends exactly
hash pinning; it reuses the Unicode-Tag lessons from sources 6–7 and the markdown-exfiltration pattern from 12–13, so
part of D lives inside A. B and C stay on the shortlist for a later Thursday.

Distinctness from earlier lab tools: Leashcheck (093/094) audits *config files in a repo* (which servers you launch and
how); TOOLTRAP (086) is a vulnerable lab. Toolprint audits *what a server tells the model* (its live tool list) and
whether that changed after you approved it.

## Not verified (not used for any claim)
- Reddit threads about small-business MCP pain (domain blocked to the scouts).
- Lakera pricing and language coverage; last-commit dates of MCP-Shield and Agent Scan.
- GHSA-qx49-fqc8-xw99 (GitHub returned 404 to a scout).
