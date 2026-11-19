# Research — Experiment 103 (Thursday lane: AI agents)

Run date: 2026-11-19 (UTC). Three scouts researched in parallel (rising threats, real small-business pain, existing tools). Then the lead agent opened the key sources again. All sources below were opened or seen in search results **during this run**, as marked. No figure here is reproduced without a source, and unverified items are labeled.

## Sources

| # | Source | Source date | Accessed | Type | Takeaway |
|---|---|---|---|---|---|
| 1 | [Forcepoint X-Labs — HTML payload hijacks email summarizer](https://www.forcepoint.com/blog/x-labs/html-payload-hijacks-email-summarizer) | last updated 2026-08-25 | 2026-11-19 (opened) | primary (researcher) | The injected text was hidden with `font-size:0px; color:#ffffff; line-height:0`. The recommended defenses are to give the LLM only the text a person sees and to detect hidden styling. |
| 2 | [Sublime Security rule "prompt injection in hidden body HTML" (detection.fyi)](https://detection.fyi/sublime-security/sublime-rules/prompt_injection_hidden_body_html/) | 2026-11-06 | 2026-11-19 (opened) | primary (detection rule) | Flags `display:none`, `visibility:hidden`, `font-size:0`, `opacity:0` and the `hidden` attribute, plus comments of 80+ characters that address an AI. Needs the commercial Sublime platform and is a beta feature. |
| 3 | [IRONSCALES — "We found a worm written for your email assistant"](https://ironscales.com/blog/we-found-a-worm-written-for-your-email-assistant) | 2026-11-11 | 2026-11-19 (opened) | primary (vendor incident write-up) | A block sits below the footer and mail clients do not display it. It tells an assistant to forward the message to colleagues, search folders for wallet seed phrases, mail the results outside, and keep its reply short. |
| 4 | [Brave — Indirect prompt injection remains a fundamental security challenge](https://brave.com/blog/indirect-prompt-injection/) | 2026-06-08 | 2026-11-19 (opened) | primary (researcher) | White-on-white or zero-width text that a person cannot see but that is still in the page's text layer led an AI browser agent to send user data to a form. |
| 5 | [OWASP GenAI — LLM01:2025 Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) | 2025 | 2026-11-19 (opened) | primary (standard) | Indirect injection arrives through web pages and files and does not need to be visible to a person. Mitigations include segregating external content, least privilege, and human approval for high-risk actions. |
| 6 | [Forcepoint — hiding vs instruction prompt injection](https://www.forcepoint.com/es/blog/x-labs/hiding-vs-instruction-prompt-injection) | no date | 2026-11-19 (search result only) | researcher | Visible instructions also worked, so hiding is a signal and not the whole problem. That is why Trasluz also flags visible text written for an AI. |
| 7 | [Simon Willison — The lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) | 2025-06-16 | 2026-11-19 (scout) | expert model | The danger comes from private data, untrusted content and an exit route together. Hidden text in email is the "untrusted content" leg. |
| 8 | [LLM Guard — InvisibleText scanner](https://protectai.github.io/llm-guard/input_scanners/invisible_text) | 2025-05-19 | 2026-11-19 (scout) | existing tool | A Python library that only checks invisible Unicode. It does not cover hidden CSS or email. |
| 9 | [bountyyfi/invisible-prompt-injection](https://github.com/bountyyfi/invisible-prompt-injection) | no date (©2026) | 2026-11-19 (scout) | existing tool | Research plus a CLI. Its README does not say whether it detects hidden CSS. |
| 10 | [InjectScan (mcpservers.org listing)](https://mcpservers.org/servers/youraitools-co-guides-prompt-injection-scanner-api) | no date | 2026-11-19 (scout) | existing tool | An API with a free preview limited to 2,000 characters of text. Beyond that it is paid. |
| 11 | [Forensicate.ai (Chrome Web Store)](https://chromewebstore.google.com/detail/forensicateai-prompt-secu/ckohijglmbhlmbpiplcjhnlpijcbkapa) | no date | 2026-11-19 (scout) | existing tool | A browser extension that calls itself a proof of concept and says it does not catch everything. |
| 12 | [GHSA-rvq5-wwqv-78pq — MCP TypeScript SDK token audience](https://github.com/advisories/GHSA-rvq5-wwqv-78pq) | 2026-10-05 (published) | 2026-11-19 (scout) | primary (advisory) | `@modelcontextprotocol/sdk` 1.6.0 to before 1.32.0 accepted tokens issued for other services. Upgrading alone is not enough; `expectedResource` must be configured. (Losing candidate B.) |
| 13 | [MCP spec — Authorization (draft)](https://modelcontextprotocol.io/specification/draft/basic/authorization) | no date | 2026-11-19 (scout) | primary (spec) | Servers must validate that access tokens were issued for them as the audience. (Candidate B.) |
| 14 | [OWASP Agentic Skills Top 10 — AST01 Malicious Skills](https://owasp.github.io/www-project-agentic-skills-top-10/ast01.html) | 2026-03 (page versions conflict) | 2026-11-19 (scout) | primary (OWASP) | Gives detection signatures for malicious skill bundles. The campaign figures it quotes come from third parties and were not verified at their origin. (Candidate C.) |
| 15 | [NVIDIA SkillSpector](https://github.com/NVIDIA/SkillSpector) | no date | 2026-11-19 (scout) | existing tool | A skill scanner that uses an LLM by default and can work offline with `--no-llm`. It shows that candidate C is already well served. |
| 16 | [Anthropic — Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) | no date | 2026-11-19 (scout) | primary (vendor docs) | "Use Skills only from trusted sources", and review SKILL.md, scripts and network calls. (Candidate C.) |
| 17 | [n8n community — "Why your n8n workflow JSON is leaking credentials"](https://community.n8n.io/t/why-your-n8n-workflow-json-is-leaking-credentials-and-the-architectural-fix/289576) | 2026-04-20 | 2026-11-19 (scout) | user report | The credential store protects secrets, but HTTP Request headers typed in by hand end up in exported JSON. (Candidate D.) |
| 18 | [vibeappscanner — workflow security checker](https://vibeappscanner.com/workflow-security) | no date (©2025) | 2026-11-19 (scout) | existing tool | Free, runs in the browser and covers n8n, Make and Zapier. This shows that candidate D is already served. |
| 19 | [FlowGuard (n8n)](https://github.com/MohibShaikh/FlowGuard) | 2026-03-24 (forum post) | 2026-11-19 (scout) | existing tool | Already checks AI-agent tool access, unauthenticated webhooks and hardcoded credentials in n8n. (Candidate D.) |
| 20 | [n8n docs — Webhook node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/) | no date | 2026-11-19 (scout) | primary (vendor docs) | Authentication can be Basic, Header, JWT or None. (Candidate D.) |
| 21 | [arXiv 2511.05797 — "When AI Meets the Web" (chatbot plugins)](https://arxiv.org/html/2511.05797v1) | 2025-11-08 | 2026-11-19 (scout, through a secondary summary) | academic | According to the summary, 8 of 17 chatbot plugins accepted forged conversation history. The full paper was not read. (Candidate E.) |

Count: 21 distinct links. 5 were opened directly by the lead agent in this run (1–5) and the rest by the scouts. Primary sources: 1, 2, 3, 4, 5, 12, 13, 14, 16, 20.

## Candidates and judge

Score 1–5 on usefulness to a small business × freshness × feasibility in one run × shareability.

| Candidate | Use | Fresh | Feasible | Share | Total | Notes |
|---|---|---|---|---|---|---|
| **A. Hidden text for AI in web pages and emails (Trasluz)** | 5 | 5 | 4 | 5 | **500** | Sources dated 6 and 11 Nov 2026. No free local tool takes a page or .eml and gives a verdict (8–11). It works on a business's own website, newsletter templates and incoming mail, and it fits the Friday passive report (home page HTML). |
| B. MCP OAuth audience / metadata checker | 3 | 5 | 4 | 2 | 120 | Fresh advisory (12), but few small businesses run their own remote MCP server with OAuth. Kept for a future Thursday. |
| C. Agent skill bundle auditor | 3 | 4 | 3 | 3 | 108 | Already well covered by SkillSpector and many others (15). |
| D. n8n / Make / Zapier workflow auditor | 4 | 3 | 4 | 3 | 144 | Already covered for free in the browser (18) and by FlowGuard (19). It could come back as a Spanish-language "lethal trifecta" view. |
| E. Website chatbot widget checker (client-side keys, forged history) | 4 | 2 | 3 | 3 | 72 | The evidence is a 2025 paper read through a secondary summary, and an anecdotal 2024 forum thread. |

**Pick: A — Trasluz.** It combines the CSS hiding techniques documented in sources 1, 2 and 4, comments and attributes as in 2, invisible Unicode as in 4 and 8, the plain-text MIME alternative, and EN/ES phrases aimed at an AI. It adds a "visible text only" output, because that is the defense recommended in source 1.

## Design decisions taken from the research
- Hidden alone is not an attack: email preheaders (`display:none`) and screen-reader text (`clip`) are legitimate. So Trasluz grades by content: instructions in hidden text are high, long hidden text is medium, a short preheader is low, and screen-reader text without instructions is ignored.
- Visible instructions also work (6), so visible text written for an AI is medium.
- Rules inside `@media` are not applied, because mobile/desktop swaps in email templates would cause false alarms.
- Flag emoji use Unicode Tag characters legitimately and are exempt.
- Nothing is sent anywhere. Trasluz uses no LLM and needs no API key, which is what separates it from 8–11.
