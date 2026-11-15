# Headerfix 1.1

Paste your website's HTTP response headers, get a grade and copy-paste fixes for nginx, Apache, Netlify, Cloudflare Pages, Caddy or PHP. Offline, zero dependencies, English and Spanish.

En español: pega los encabezados de respuesta de tu sitio y obtén una nota y las líneas exactas para corregirlos en tu servidor. La versión 1.1 corrige dos salidas que estaban mal (PHP y Netlify) y detecta encabezados obsoletos, cookies `__Host-` que el navegador rechaza y encabezados duplicados.

**Live demo (paste headers, runs in your browser, nothing is uploaded):** https://freyesperales.github.io/dev-experiments-365/experiments/experiment-099/

**New in 1.1** (maintenance release of [Experiment 096](../experiment-096/), rules re-checked against MDN, OWASP, RFC 6797, CSP3 and vendor docs opened on 2026-11-15, see `RESEARCH.md`):

- **Fixed:** `--server php` printed a generic list instead of PHP code (the renderer expected `htaccess-php`).
- **Fixed:** the Netlify `_headers` output used `! Name` to remove headers. Netlify documents no removal syntax, so 1.1 prints a comment telling you to hide the header where it is set. Cloudflare Pages does support `! Name` and keeps it, now with its limits (100 rules, 2000 characters per line).
- **New:** the nginx block warns that a `location { }` with its own `add_header` drops the inherited ones, and names `add_header_inherit merge;` (nginx 1.29.3+). The Apache block explains `always` and the `Header onsuccess unset` trick for duplicates coming from PHP-FPM or a proxy.
- **New rules:** `X-XSS-Protection` other than `0` (fix: `0`); obsolete `Expect-CT`, `Public-Key-Pins`, `Feature-Policy` (fix: remove); `__Host-`, `__Secure-`, `__Http-` and `__Host-Http-` cookies missing `Secure`, `HttpOnly` or `Path=/`, or with `Domain` (the browser silently drops them); duplicate HSTS (browsers use only the first one) and duplicate CSP (browsers enforce every copy); HSTS `preload` without the preload-list requirements.
- 30 tests (19 → 30), including MDN's own accepted and rejected cookie examples.

## Sample run

```text
$ node headerfix.js fixtures/legacy.txt --server nginx
Headerfix grade C  (74/100)   HTTP 200
[MEDIUM] Cookie "__Host-session" uses the __Host- prefix but it sets Domain; browsers silently reject it, so it is never stored.
[LOW   ] Strict-Transport-Security appears 2 times. Browsers use only the FIRST one (RFC 6797 section 8.1), which may not be the one you meant. Usually the server and the app (or a plugin) both set it: keep one.
[LOW   ] HSTS says "preload" but does not meet the preload list rules (max-age of at least 31536000 and includeSubDomains, see hstspreload.org): no includeSubDomains.
[LOW   ] X-XSS-Protection: 1; mode=block. This old filter is obsolete and its "1" / "mode=block" settings can create leaks on sites that were safe (MDN, OWASP). Set it to 0 or remove it; rely on CSP instead.
[LOW   ] Feature-Policy was renamed Permissions-Policy and the syntax changed (camera 'none' becomes camera=()). Browsers that dropped the old name ignore it.
[INFO  ] HSTS lacks includeSubDomains. Add it only once every subdomain works over HTTPS.
[INFO  ] No Permissions-Policy: embedded content may request camera, microphone or location. Low priority.
[INFO  ] Header "Expect-CT" is obsolete (Certificate Transparency is enforced by default now). Browsers ignore it; remove it so it does not give a false sense of protection.

# nginx: put inside the server { } block that serves HTTPS, then `nginx -t && nginx -s reload`
# If a location { } block has its own add_header, it DROPS these (nginx inheritance rule). On nginx 1.29.3+ add `add_header_inherit merge;` there.
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header X-XSS-Protection "0" always;
proxy_hide_header Expect-CT;   # use fastcgi_hide_header for PHP-FPM
proxy_hide_header Feature-Policy;   # use fastcgi_hide_header for PHP-FPM
                                                       (exit code 0: no high findings)

$ node headerfix.js fixtures/good.txt
Headerfix grade A+  (100/100)
No findings.                                           (exit code 0)
```

## Run

```sh
curl -sI https://your-site.example | node headerfix.js --server apache --lang es
node headerfix.js headers.txt [--server nginx|apache|netlify|cloudflare|caddy|php|plain] [--json] [--http] [--fail-on high|medium|low|never]
npm test        # 30 tests, node:test, no install step
```

Needs Node 18+. Exit codes: `0` ok, `1` findings at/above `--fail-on` (default `high`), `2` usage/input error. It reads text you give it; it never contacts your site.

## What it checks

HSTS (missing, short, invalid, duplicated, `preload` requirements) · Content-Security-Policy (missing, report-only only, `unsafe-inline`/`unsafe-eval`, wildcard sources, no `object-src`/`base-uri`/`frame-ancestors`, duplicated) · clickjacking protection · `nosniff` · Referrer-Policy · Permissions-Policy · obsolete headers (`X-XSS-Protection`, `Expect-CT`, `Public-Key-Pins`, `Feature-Policy`) · version-leaking headers (`Server`, `X-Powered-By`, ...) · cookie flags (`Secure`, `HttpOnly`, `SameSite`) and prefixes (`__Host-`, `__Secure-`, `__Http-`, `__Host-Http-`) · CORS wildcard with credentials. For a site with no CSP it proposes a **Report-Only** starter policy first, because a CSP added blind is what breaks shops and WordPress themes.

## Who it is for

A small business owner, or the person who runs their website, shop or blog. Run `curl -I` (or copy "Response Headers" from the browser DevTools Network tab), paste, and send the fix block to whoever manages the server or CDN. On hosted platforms where you cannot set headers, the result still tells you what is missing.

## Why it exists

- Duplicated headers are a real WordPress problem: a headers plugin sent 8 duplicates at once, from PHP and `.htaccess` ([WordPress.org support thread](https://wordpress.org/support/topic/duplicate-headers-bis/)). With HSTS only the first copy counts ([RFC 6797 §8.1](https://www.rfc-editor.org/rfc/rfc6797.html)); with CSP every copy is enforced ([CSP3](https://www.w3.org/TR/CSP3/)).
- In nginx, one `add_header` inside a `location` silently removes all inherited security headers ([nginx docs](https://nginx.org/en/docs/http/ngx_http_headers_module.html)).
- Some scanners still ask for `X-XSS-Protection: 1; mode=block`, while MDN and the [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html) say to turn it off. Live-host scanners such as MDN HTTP Observatory do not give per-server snippets (see `RESEARCH.md`).

## Limitations

- A heuristic review of pasted headers, not a scan: it cannot see headers you did not paste, content, or TLS. A good grade is not a guarantee.
- The proposed CSP is a *starting point in Report-Only mode*; sites with third-party scripts need it tuned before enforcing.
- The HSTS `preload` check only covers the header. The preload list also requires an HTTP→HTTPS redirect on the same host and HSTS on HTTPS redirects, which pasted headers cannot show.
- The cookie-prefix check cannot know whether the cookie was set from an HTTPS page; it assumes it was unless you pass `--http`.
- Netlify: there is no documented way to remove a header in `_headers`, so removals are only advice. Apache cannot always remove `Server`; the output points to `ServerTokens Prod`. Shopify/Wix-style hosted platforms may not allow custom headers at all.
- PHP: `header()` and `header_remove()` only work before any output is sent (blank lines included).
- Header names are matched case-insensitively; HTTP/2 pseudo-headers are ignored; only the last response of a redirect chain is graded.

## Files

`headerfix.js` (library + CLI, also loaded by the demo) · `index.html` (browser demo) · `fixtures/` (`good`, `bad`, `redirect`, `legacy`) · `test/` · `RESEARCH.md`

---
Daily Security Lab · Experiment 099 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
