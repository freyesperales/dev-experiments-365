# Research — Experiment 099 (Headerfix 1.1, Sunday maintenance)

Run date: 2026-11-15 (UTC). Lane: Sunday maintenance of an existing tool (Headerfix, experiment 096).
Method: 3 research scouts in parallel (specs, server docs, defender pain + competitors), all pages opened live in this run. Earlier research for 1.0 is in `../experiment-096/RESEARCH.md`; 1.0 could not fetch MDN, which is why the rules are checked again here.

## Sources (all accessed 2026-11-15)

| # | Kind | URL | Source date | Takeaway |
|---|------|-----|-------------|----------|
| 1 | primary (docs) | https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-XSS-Protection | 2026-08-21 | Obsolete, non-standard; can create XSS on sites that were safe; `mode=block` is exposed to side-channel leaks when the page can be framed. Use CSP instead. |
| 2 | primary (guidance) | https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html | no date | "Do not set this header or explicitly turn it off" (example `0`); Expect-CT and Public-Key-Pins should not be used and should be removed. Basis for rules `xxss` and `obsolete`. |
| 3 | primary (docs) | https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Expect-CT | 2026-08-27 | Obsolete; Chromium dropped it from version 107 because Certificate Transparency is enforced by default. |
| 4 | primary (docs) | https://developer.mozilla.org/en-US/docs/Glossary/HPKP | 2026-08-15 | HPKP is obsolete. |
| 5 | primary (docs) | https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Permissions_Policy | 2026-10-23 | Feature-Policy was renamed Permissions-Policy and the header syntax changed, so a rename is not enough (rule `feature_policy` says so). |
| 6 | primary (docs) | https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie | 2026-09-01 | `__Secure-` requires `Secure` (set from HTTPS); `__Host-` also requires `Path=/` and no `Domain`. Rule `cookie_prefix`. |
| 7 | primary (standard) | https://www.rfc-editor.org/rfc/rfc6797.html | 2012-11 | Section 8.1: with several HSTS header fields "the UA MUST process only the first". Rule `dup_hsts`; Headerfix grades the first copy too. |
| 8 | primary (standard) | https://www.w3.org/TR/CSP3/ | 2026-10-27 (W3C Working Draft) | Each policy is parsed and enforced separately and any of them can block. Rule `dup_csp` (copies add up, they never relax each other). |
| 9 | primary (project rules) | https://hstspreload.org/ | no date | Preload needs `max-age` >= 31536000, `includeSubDomains`, `preload`, HTTP→HTTPS redirect on the same host, HSTS on HTTPS redirects too. Rule `hsts_preload` (only the header part can be checked from pasted text). |
| 10 | primary (vendor docs) | https://nginx.org/en/docs/http/ngx_http_headers_module.html | no date | `add_header` is inherited "if and only if there are no add_header directives defined on the current level"; `add_header_inherit on\|off\|merge` exists; without `always` headers are only added on 2xx/3xx. The nginx fix block now warns about this. |
| 11 | primary (changelog) | https://nginx.org/en/CHANGES | 2025-10-28 entry | "Changes with nginx 1.29.3 … the add_header_inherit and add_trailer_inherit directives." |
| 12 | primary (vendor docs) | https://developers.cloudflare.com/pages/configuration/headers/ | 2026-11-12 | Remove a header with `! Name` under the path; max 100 rules, 2000 characters per line. Kept for Cloudflare, limits added to the output comment. |
| 13 | primary (vendor docs) | https://docs.netlify.com/routing/headers/ | 2025-12-01 | Documents only setting headers; no `!` or any removal syntax. **Bug in 1.0:** Netlify output used `! Name`. 1.1 prints a comment instead. |
| 14 | primary (vendor docs) | https://caddyserver.com/docs/caddyfile/directives/header | no date | `-Field` deletes, `Field value` sets/overwrites. Matches existing Caddy output (no change). |
| 15 | primary (vendor docs) | https://httpd.apache.org/docs/current/mod/mod_headers.html | no date | `always` applies on errors and internal redirects; headers from CGI/mod_proxy_fcgi can end up duplicated; doc's fix is `Header onsuccess unset X` then `Header always set X`. Added as a comment to the Apache block. |
| 16 | primary (vendor docs) | https://www.php.net/manual/en/function.header-remove.php | no date | `header_remove(?string $name = null)`; with no name it removes every PHP header including cookies. Headerfix always passes a name. |
| 17 | primary (vendor docs) | https://www.php.net/manual/en/function.header.php | no date | `header()` must run before any output, blank lines included (already in the PHP comment's spirit; README notes it). |
| 18 | defender pain (support forum) | https://wordpress.org/support/topic/duplicate-headers-bis/ | modified 2026-06-21 | A WordPress headers plugin sent 8 duplicated headers (PHP plus `.htaccess` on LiteSpeed); fixed in a later plugin release. Real case for `dup_hsts` / `dup_csp`. |
| 19 | defender pain (forum) | https://laracasts.com/discuss/replies/975739 | 2026-04-23 | Adding `__Host-` to a Laravel session cookie broke login. Silent cookie rejection is exactly what `cookie_prefix` explains. |
| 20 | competitor (blog, conflict of interest: author promotes an alternative) | https://joetiedeman.uk/2026/01/22/snyk-is-shutting-down-the-securityheaders-com-api/ | 2026-01-22 | securityheaders.com API shut down (announced 2025, effective April 2026); the free web page said to stay "for the foreseeable future". Not confirmed first hand (securityheaders.com/about returned 403). |
| 21 | competitor (issue tracker) | https://github.com/mdn/mdn-http-observatory/issues | live list | 19 open issues (Integrity-Policy, deeper CSP-Report-Only analysis, Referrer-Policy scoring); none asks for per-server config snippets. Observatory still scans a live host. |

21 distinct links opened in this run; 17 primary sources.

## Second loop: direct verification (depth gate)

The first pass took 6 minutes, under the 10-minute floor, so the claims the code relies on were re-opened directly (not through a scout) on 2026-11-15:

- Netlify headers docs (updated 2025-12-01): confirmed, no removal syntax; the page also says custom headers generally cannot change `Server`, `Date` or `Set-Cookie`.
- nginx headers module: confirmed the inheritance sentence, `add_header_inherit on | off | merge;` (default `on`), "This directive appeared in version 1.29.3", and that `merge` appends the previous level's values.
- RFC 6797 section 8.1: confirmed "the UA MUST process only the first such header field".
- Cloudflare Pages headers docs (updated 2026-11-12): confirmed `! Name` (exclamation mark and space), "up to 100 header rules", "2,000 character limit" per line.
- MDN Set-Cookie: confirmed the `__Secure-` and `__Host-` rules and found two prefixes the scouts did not report: **`__Http-`** (Secure + HttpOnly) and **`__Host-Http-`** (Secure + HttpOnly + the `__Host-` rules). MDN also warns that browsers without prefix support accept prefixed cookies anyway. Added to rule `cookie_prefix`, with MDN's accepted/rejected examples as a test.

## Candidate improvements and judge

Score = usefulness to a small business × freshness × feasibility in one run × shareability (1–5 each).

| Candidate | Use | Fresh | Feas. | Share | Total | Decision |
|---|---|---|---|---|---|---|
| A. Headerfix 1.1: fix wrong server output (`--server php` printed plain text; Netlify `!` removal is undocumented), nginx inheritance warning, obsolete headers (X-XSS-Protection, Expect-CT, HPKP, Feature-Policy), cookie prefixes, duplicate HSTS/CSP semantics, HSTS preload | 5 | 4 | 5 | 4 | 400 | **chosen** |
| B. Toolprint 1.1 (MCP tools list): more languages for phrase rules | 3 | 3 | 4 | 3 | 108 | later |
| C. Headerfix: Integrity-Policy header support (Observatory issue #268) | 2 | 4 | 3 | 2 | 48 | later: browser support not verified in this run |

Why A: two of its changes fix output that was **wrong** in 1.0 (found by testing real inputs and by the Netlify docs), and the rest come straight from MDN/OWASP/RFC pages that 1.0 could not open.

## Bugs found by testing 1.0

1. `node headerfix.js --server php` printed the generic `Header: value` list: the renderer's switch used `htaccess-php` while the CLI and demo pass `php`. Fixed; test added.
2. Netlify `_headers` output used `! Name` to remove headers; Netlify's docs (source 13) document no removal syntax. Fixed; test added.
