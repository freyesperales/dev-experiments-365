# Research — Experiment 096 (Wednesday: web hygiene)

Date of run: 2026-11-11. Network note: in this run only github.com / raw.githubusercontent.com were reachable
(WebFetch and curl failed with name-resolution errors for developer.mozilla.org, letsencrypt.org, cabforum.org,
rfc-editor.org, community.shopify.com, etc.). Primary sources below were therefore read from their official
GitHub repositories. Search-result snippets were used only for ideas and are listed separately as "unverified leads".

## Sources fetched in this run (accessed 2026-11-11)

| # | Type | URL | Source date | Takeaway |
|---|------|-----|-------------|----------|
| 1 | primary (vendor docs) | https://raw.githubusercontent.com/letsencrypt/website/main/content/en/docs/cert-lifetimes.md | lastmod 2026-07-22 | 90-day default stays for now; 6-day certs optional; Let's Encrypt plans 45-day max by Feb 2028 because industry rules cap certs at 47 days from 2029-03-15. Cron-based renewal habits will break. |
| 2 | primary (standard) | https://raw.githubusercontent.com/cabforum/servercert/main/docs/BR.md | no date (Baseline Requirements, current main) | Max subscriber-cert validity: 200 days from 2026-03-15, 100 days from 2027-03-15, 47 days from 2029-03-15. |
| 3 | primary (project data) | https://raw.githubusercontent.com/OWASP/www-project-secure-headers/master/ci/headers_add.json | last_update_utc 2026-10-18 | OWASP Secure Headers Project's current recommended response headers and values (HSTS 63072000, nosniff, Referrer-Policy, COOP/CORP, CSP baseline, Permissions-Policy). |
| 4 | primary (project data) | https://raw.githubusercontent.com/OWASP/www-project-secure-headers/master/ci/headers_remove.json | last_update_utc 2026-10-18 | OSHP list of headers to remove because they disclose software/versions (Server, X-Powered-By, X-AspNet-Version, X-Generator, X-CMS, X-Joomla-Version...). Basis for Headerfix's information-leak rule. |
| 5 | primary (standard) | https://raw.githubusercontent.com/securitytxt/security-txt/master/README.md | no date | security.txt is RFC 9116; lives at /.well-known/security.txt, must be text/plain over HTTPS. (Noted for a later experiment; not built today.) |
| 6 | competitor (project README) | https://raw.githubusercontent.com/mdn/mdn-http-observatory/main/README.md | no date | MDN HTTP Observatory is host-scan only: needs the live host, no pasted-headers mode, README shows no per-server fix snippets. |
| 7 | competitor (project page) | https://github.com/mdn/mdn-http-observatory | no date (V1 API shutdown 2024-10-31 per page) | Same tool; local API server needs Postgres. |
| 8 | competitor (project page) | https://github.com/google/csp-evaluator | no date | Library only (npm), takes a CSP string, no CLI and no server-config output. |
| 9 | competitor (project page) | https://github.com/oh2fih/securitytxt-tools | no date | Bash 4+ with gpg/curl/awk; CLI-only. |
| 10 | competitor (project page) | https://github.com/spaze/security-txt | no date | PHP library/CLI; v3 needs PHP 8.5; awkward for non-developers. |

| 11 | primary (standard) | https://raw.githubusercontent.com/w3c/webappsec-csp/main/index.bs | W3C CSP Level 3 editor's draft (Status: ED, no date) | Section "Does a source list allow all inline behavior": 'unsafe-inline' is overridden when a nonce or hash source is present, so Headerfix does not flag it in that case (covered by a test). frame-ancestors is a CSP directive that replaces X-Frame-Options for framing. |

11 distinct links fetched, 6 primary (1-5, 11), 5 on existing tools (6-10). Second research loop (after the depth gate flagged a short run) added source 11 and checked CSP rule semantics against the spec text. A Referrer-Policy spec fetch returned 404 and is not claimed.

## Unverified leads (search snippets only, NOT fetched, not used for any claim in the tool)
- Search summaries mention Chrome "connection allowlists" (dated 2026-09-23 per snippet), script-src hash extensions, and a Snyk note about the securityheaders.com API shutting down (secondary blog, 2026-01-22 per URL). Not verified, so Headerfix makes no claim about them.
- Forum threads (WordPress, GeneratePress, WPML, Shopify, Wix) about CSP breaking sites and platforms where owners cannot set headers: the pages could not be fetched. The "start in Report-Only" decision is a standard practice, not a measured claim.

## Candidates and JUDGE (usefulness x freshness x feasibility x shareability, 1-5 each)

| Candidate | U | F | Fe | S | Total |
|---|---|---|---|---|---|
| **A. Headerfix**: paste response headers (+ cookies, CSP) -> grade + copy-paste fixes for nginx/Apache/Netlify/Cloudflare/Caddy/PHP, Spanish + English, offline | 5 | 3 | 5 | 5 | **18** |
| B. Cert-lifetime renewal checker (lifetime vs. renewal cron, using sources 1-2) | 4 | 5 | 3 (needs live TLS read; offline form is only a calculator) | 4 | 16 |
| C. security.txt + CAA builder/linter (source 5) | 3 | 2 | 5 | 3 | 13 |
| D. CSP Doctor alone | 4 | 3 | 4 | 4 | 15 |

Pick: A. Gap evidence (sources 6-8): the verified existing tools need a live host or are libraries, and none shown produces server-specific fix blocks. Caveat: paste-and-analyze header tools may exist (leads only, not verified), so the claim is "no per-server fixes found in the tools I could read", not "nothing exists". B is the best follow-up for a later Wednesday once the network allows reading live certificates.
