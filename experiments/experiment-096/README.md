# Headerfix

Paste your website's HTTP response headers, get a grade and copy-paste fixes for nginx, Apache, Netlify, Cloudflare Pages, Caddy or PHP. Offline, zero dependencies, English and Spanish.

En español: pega los encabezados de respuesta de tu sitio y obtén una nota y las líneas exactas para corregirlos en tu servidor. Todo corre en tu navegador o en tu terminal; nada se sube.

**Live demo (paste headers, runs in your browser):** https://freyesperales.github.io/dev-experiments-365/experiments/experiment-096/

## Sample run

```text
$ node headerfix.js fixtures/bad.txt --server nginx
Headerfix grade F  (0/100)   HTTP 200
[HIGH  ] No Strict-Transport-Security (HSTS): browsers may still reach your site over plain HTTP.
[HIGH  ] CSP allows 'unsafe-inline' for scripts, which cancels most of its protection against injected code.
[HIGH  ] CSP script source is a wildcard or a whole scheme (*): any site on it can supply scripts.
[HIGH  ] Access-Control-Allow-Origin: * together with Allow-Credentials: true. ...
[MEDIUM] Cookie "PHPSESSID" looks like a session/login cookie but has no HttpOnly: page scripts can read it.
...
# nginx: put inside the server { } block that serves HTTPS, then `nginx -t && nginx -s reload`
add_header Strict-Transport-Security "max-age=31536000" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
server_tokens off;   # in http { }: hides the nginx version
...                                                    (exit code 1)

$ node headerfix.js fixtures/good.txt
Headerfix grade A+  (100/100)
No findings.                                           (exit code 0)
```

## Run

```sh
curl -sI https://your-site.example | node headerfix.js --server apache --lang es
node headerfix.js headers.txt [--json] [--http] [--fail-on high|medium|low|never]
npm test        # 19 tests, node:test, no install step
```

Needs Node 18+. Exit codes: `0` ok, `1` findings at/above `--fail-on` (default `high`), `2` usage/input error. It reads text you give it; it never contacts your site.

## What it checks

HSTS (missing, short, invalid) · Content-Security-Policy (missing, report-only only, `unsafe-inline`/`unsafe-eval`, wildcard sources, no `object-src`/`base-uri`/`frame-ancestors`) · clickjacking protection · `nosniff` · Referrer-Policy · Permissions-Policy · version-leaking headers (`Server`, `X-Powered-By`, ...) · cookie flags (`Secure`, `HttpOnly`, `SameSite`) · CORS wildcard with credentials · duplicate headers. For a site with no CSP it proposes a **Report-Only** starter policy first, because a CSP added blind is what breaks shops and WordPress themes.

## Who it is for

A small business owner, or the person who runs their website, shop or blog. Run `curl -I` (or copy "Response Headers" from the browser DevTools Network tab), paste, and send the fix block to whoever manages the server or CDN. On hosted platforms where you cannot set headers, the result still tells you what is missing.

## Why it exists

- Existing scanners read from a live host: the MDN HTTP Observatory README shows host-scan only, no pasted-headers mode and no per-server fix snippets; Google's CSP Evaluator is a library with no CLI or server-config output (see `RESEARCH.md`).
- The OWASP Secure Headers Project publishes the recommended headers and the "remove these" list that the rules follow (data updated 2026-10-18).
- The W3C CSP draft says a nonce or hash overrides `'unsafe-inline'`; Headerfix follows that.

## Limitations

- A heuristic review of pasted headers, not a scan: it cannot see headers you did not paste, content, or TLS. A good grade is not a guarantee.
- The proposed CSP is a *starting point in Report-Only mode*; sites with third-party scripts need it tuned before enforcing.
- Rules were checked against OWASP data and the CSP draft; MDN/Mozilla docs, Referrer-Policy spec and browser blog posts could not be fetched in this run (network limits), see `RESEARCH.md`.
- Apache cannot always remove `Server`; the output points to `ServerTokens Prod`. Shopify/Wix-style hosted platforms may not allow custom headers at all.
- Header names are matched case-insensitively; HTTP/2 pseudo-headers are ignored; only the last response of a redirect chain is graded.

---
Daily Security Lab · Experiment 096 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
