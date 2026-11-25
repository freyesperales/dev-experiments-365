# Aduana

Paste the page source of your website and see what crosses into it: every outside address that loads code, mixed content, the http:// links Chrome now stops at, and scripts nobody pinned. Then get a Content Security Policy built from what the page really uses, in report-only mode so it cannot break anything.

En español: pega el código fuente de tu sitio y Aduana te dice qué entra en él (scripts de afuera, contenido mixto, enlaces http:// que Chrome ahora frena, librerías sin integrity) y te arma una Content Security Policy en modo solo informe, con las direcciones que documenta cada proveedor.
Funciona en tu navegador, sin cuenta y sin subir nada.

**Live demo:** https://freyesperales.github.io/dev-experiments-365/experiments/experiment-109/ (add `?lang=es` for Spanish)

## Sample run

`node aduana.js --demo shop` runs on an invented shop (`www.example.com`) with Google Tag Manager, Google Analytics, the Meta Pixel, reCAPTCHA, Stripe.js, jQuery from a CDN, an old polyfill.io line and a few http:// leftovers:

```
Aduana 1.0.0  ·  Your page: https://www.example.com

>> FIX THIS FIRST — Something on this page is broken or exposed today. The FIX items say what and how.

10 outside addresses · 7 scripts · 4 inline scripts · 1 inline event handlers · 1 links to other sites still use http://

[FIX]   Mixed content that browsers block
        The page is https:// but loads these over http://. Browsers block scripts, styles, frames, fonts and srcset images over http://, so they do not work for your visitors. Change each address to https:// (check first that the file exists there).
        - script · http://widgets.example.net/chat/loader.js (line 24)
        - img · http://img.example.org/banner-800.jpg (line 37)
[FIX]   A form sends what people type without encryption
        The form action is http://. Names, emails or passwords typed here travel in plain text. Change the action to https://.
        - http://www.example.com/newsletter (line 39)
[FIX]   A script from an address that is known to be unsafe: cdn.polyfill.io
        polyfill.io was taken over in 2024 and served malware; Cloudflare said it "can no longer be trusted and should be removed from websites".
        - https://cdn.polyfill.io/v3/polyfill.min.js (line 23)
[FIX]   integrity without crossorigin
        MDN: a cross-origin file with integrity must also carry the crossorigin attribute, or the browser cannot check it and blocks it. Add crossorigin="anonymous".
        - https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css (line 20)
[CHECK] Mixed content that browsers upgrade
        Images, audio and video written as http://. Browsers rewrite them to https:// and the file fails if it is not there. Write https:// yourself.
        - http://img.example.org/fondo.jpg (line 29)
        - http://img.example.org/logo.png (line 36)
[CHECK] Links to your own site with http://
        Chrome now tries HTTPS first and asks the visitor before falling back to HTTP; any http:// hop in a redirect also triggers the warning. Write these links as https://. Links that say https:// never fall back.
        - http://www.example.com/contacto/ (line 32)
        - http://example.com/ofertas (line 33)
[CHECK] Canonical or sharing address with http://
        Search engines and social networks will use this http:// address. Change it to https://.
        - og:url: http://www.example.com/ (line 7)
[CHECK] Library from a public CDN without integrity
        …
== Starter policy (report only, works with this page today)
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline' https://*.js.stripe.com https://cdn.jsdelivr.net https://code.jquery.com https://connect.facebook.net https://js.stripe.com https://widgets.example.net https://www.google.com/recaptcha/ https://www.googletagmanager.com https://www.gstatic.com/recaptcha/; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; img-src 'self' data: https://*.g.doubleclick.net https://*.google-analytics.com https://*.google.com https://img.example.org https://www.facebook.com https://www.googletagmanager.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.g.doubleclick.net https://*.google-analytics.com https://*.google.com https://api.stripe.com https://connect.facebook.net https://pagead2.googlesyndication.com https://www.facebook.com https://www.google.com https://www.google.com/recaptcha/ https://www.googletagmanager.com; frame-src 'self' https://*.js.stripe.com https://hooks.stripe.com https://js.stripe.com https://recaptcha.google.com/recaptcha/ https://www.google.com/recaptcha/ https://www.googletagmanager.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
```

With `--es` the whole report comes out in Spanish. Add `--csp "<your current policy>"` to see what it would block today, and `--google-tld cl` to add the Google country domain that Google asks for.

## Run it

- In the browser: open the live demo and paste the page source (right click, *View page source*, select all, copy). Optional: paste your current CSP and your country.
- Command line (Node 18+, no install): `node aduana.js page.html` · `curl -s https://www.example.com/ | node aduana.js -` · `node aduana.js page.html --server nginx` prints the line for your server · `node aduana.js --sri jquery.min.js` prints the integrity attribute for a file.
- Exit code: 0 clean, 1 worth checking, 2 fix this first, 3 bad input. `--json` for scripts.

## Who it is for

The owner of a small business website, shop or WordPress site, and the person who runs it for them. Over the years they added Google Tag Manager, a pixel and a chat widget. Now they want a Content Security Policy, or a scanner told them the site "has no CSP", and they are afraid of breaking the checkout.

## What it checks

- **Mixed content**, split the way browsers treat it. Scripts, styles, frames, fonts and `srcset` images over http:// are blocked. Plain images, audio and video are upgraded, and fail if the file is not on https. An http image on a bare IP address is blocked.
- **http:// links to your own domain**, plus the canonical and `og:url` addresses. Since Chrome 154 (October 2026), Chrome asks visitors before it opens a public site over HTTP, and any http:// hop in a redirect triggers the warning ([Chromium guide](https://chromium.googlesource.com/chromium/src/+/main/docs/security/ask-before-http/ask-before-http-adoption-guide.md)).
- **Forms that post to http://.**
- **Subresource Integrity.** It flags four cases: a library from a public CDN with a fixed version but no `integrity`, a CDN address without a version (`@latest`), `integrity` without `crossorigin`, and a hash algorithm that browsers reject. Scripts that change by design (tag managers, pixels, A/B testing) are grouped by vendor, because pinning them is not possible. When every outside script is pinned, it suggests `Integrity-Policy-Report-Only`.
- **Addresses known to be unsafe**: polyfill.io and the CDNs from the same 2024 incident.
- **Inline code**: `<script>` blocks, `onclick`-style attributes and `javascript:` links. It gives the SHA-256 hash of each block and warns when a block changes on every visit (a WordPress nonce, for example).
- **Your current CSP**, pasted or found in a `<meta>` tag. It shows:
  - what on this page your policy would block;
  - which origins the vendors document that your policy is missing;
  - `'unsafe-inline'` silently ignored next to a nonce or a hash;
  - risky sources: `'strict-dynamic'`, `*`, `'unsafe-eval'` and `data:` in scripts;
  - missing `object-src` and `base-uri`;
  - directives that a `<meta>` policy ignores.
- **A starter policy** in `Content-Security-Policy-Report-Only` mode. It is built from the addresses in the page plus the origins in each vendor's own CSP guide: Google Tag Manager, Google Analytics, Google Ads, reCAPTCHA, Cloudflare Turnstile, Stripe.js, Stripe Checkout and Google Fonts. Meta publishes no CSP list for its pixel, and the tool says so.
- **A stricter policy** that uses hashes instead of `'unsafe-inline'`, when the page allows it.
- **Lines to copy and paste** for nginx, Apache, PHP and Netlify.

## Why it exists

- Owners get stuck between "add a CSP" and a broken site. One wrote: "conversion tracking is blocked due to the Content Security Policy" ([WordPress.org](https://wordpress.org/support/topic/google-tag-manager-is-beeing-blocked-due-to-csp/)). Google even built a diagnostic for origins missing from a CSP ([Tag Manager Help](https://support.google.com/tagmanager/answer/14681508)).
- The tools that exist do not close the gap. Laboratory, the one CSP builder aimed at site owners, has not been updated since 2021 ([april/laboratory](https://github.com/april/laboratory)). Google's CSP Evaluator checks a policy but does not write one.
- Chrome turned on "Always Use Secure Connections" for everybody in October 2026 ([Google](https://blog.google/security/chrome-now-warns-before-insecure-http-connections/)). Leftover http:// links used to pass unseen; now they show a warning.
- Outside scripts keep being the way in. On 16 November 2026, tampered Optimizely snippets reached at least 178 organisations ([SecureWorld](https://www.secureworld.io/industry-news/third-party-script-hijack-optimjack)). In October, a hacked analytics file skimmed cards at checkout ([BleepingComputer](https://bleepingcomputer.com/news/security/hackers-hijack-convertr-analytics-script-to-steal-payment-card-data)). Knowing what you load is step one.

Every source is in [RESEARCH.md](RESEARCH.md), with its date and what was read in it.

## Limitations

- It reads only the HTML you paste. Scripts that other scripts load later (what Tag Manager adds, for example) show up only as the vendor origins the tool knows. The real test is the report-only period, watching the browser's Issues tab.
- An allow-list says *where* code may come from, not whether the code is honest. It would not have stopped the Optimizely tampering, because the code came from the allowed address.
- The vendor origins are copied from each vendor's CSP guide as read on 2026-11-25. Vendors change them, so the tool prints the link to each guide next to its origins. Meta's origins are inferred from its pixel code.
- Google asks you to list each Google country domain one by one (`www.google.cl`, `www.google.es`…). The tool adds only the ones you pass with `--google-tld`.
- MDN lists CSS background images both as upgradable and as blockable mixed content. The tool treats them as upgradable (CHECK, not FIX). Either way the fix is the same: write https://.
- The CSP matcher follows the CSP3 rules for the common cases: hosts, wildcards, paths, schemes, ports, `'self'`, nonces, hashes and `'strict-dynamic'`. It does not model every `'unsafe-hashes'` case, `trusted-types` or `sandbox`.
- The stricter policy keeps `'unsafe-inline'` for styles, because themes and page builders use `style="…"` attributes everywhere.
- No real website was used to build or test it, only invented pages (`example.com`).

## Tests

`npm test` (or `node --test test/*.test.js`) runs 28 tests. They cover:

- SHA-256 checked against `node:crypto`;
- the mixed-content classes, including the bare-IP case;
- the Chrome rule for http:// links;
- every SRI case;
- the vendor origins in the policy (reCAPTCHA keeps its path) and the Google country domains;
- the hash-based strict policy and its fallback;
- CSP source matching (wildcards, paths, schemes, ports, `'self'`), nonces, ignored `'unsafe-inline'` and `'strict-dynamic'`;
- the `<meta>` CSP, the lint rules and the server snippets;
- the Spanish output and the command line (exit codes, JSON, stdin, `--sri`).

The browser demo was also checked headless with Playwright: the three samples, the server tabs, Spanish, the file hash, no page errors and no network requests.

## License

MIT

---

Daily Security Lab · Experiment 109 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
