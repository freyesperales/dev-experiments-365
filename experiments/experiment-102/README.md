# Candado

Will your website's padlock keep working? Type your domain and find the four things that silently break it: CAA records that block the certificate authority that renews you, broken DNSSEC, a certificate nobody renewed, and a missing or expired security.txt.

En español: escribe tu dominio y revisa en una sola pantalla el certificado del sitio (vencimiento y renovación), los registros CAA (y si bloquean a la autoridad que te lo renueva), DNSSEC y security.txt, con el arreglo exacto para cada problema. Corre en tu navegador, sin cuenta.

**Live demo (runs in your browser):** https://freyesperales.github.io/dev-experiments-365/experiments/experiment-102/ — add `?d=yourdomain.com` to share a check.

## Sample run

```text
$ node candado.js shop.example.com --zone fixtures/bad-zone.json --ct fixtures/bad-ct.json \
                  --security-txt fixtures/bad-security.txt --now 2026-11-18T12:00:00Z
Candado 1.0.0 — shop.example.com   grade F (0/100)   6 DNS queries

DNSSEC  off
CAA     0 issue "\"letsencrypt.org\"" | 0 issue "actalis.com" | 0 issuewild ";" | 128 tbs "unknown"  (inherited from example.com)
Cert    Google Trust Services, issued 2026-09-05, expires 2026-12-04 (15 days left, 90-day lifetime)
        CAs seen in CT: Google Trust Services, Sectigo Limited
security.txt  security@example.com  Expires 2026-06-30

[HIGH  ] CAA: CAA at example.com has extra quotes inside the value: 0 issue "\"letsencrypt.org\"". CAs compare
              the text literally and will not recognise themselves.
         Fix: Recreate it so the zone shows exactly: 0 issue "letsencrypt.org" ...
[HIGH  ] CAA: CAA at example.com authorises "actalis.com", which no publicly trusted CA uses as its CAA name
              (CCADB list). Probably a typo: that line allows nobody.
         Fix: Did you mean "actalis.it"? Use: 0 issue "actalis.it"
[HIGH  ] CAA: CAA at example.com has an unknown tag "tbs" marked critical (flag 128). RFC 8659 says CAs must
              then refuse to issue at all.
[HIGH  ] CAA: Your current certificate was issued by Google Trust Services, but your CAA records only allow
              "actalis.com". The next renewal will be refused. (A certificate issued before the CAA change keeps
              working until 2026-12-04.)
         Fix: Add: 0 issue "pki.goog" (or switch the site to a CA you already allow).
[HIGH  ] CAA: Your current wildcard certificate was issued by Google Trust Services, but your CAA records allow
              no CA for wildcards. The next renewal will be refused. ...
[HIGH  ] security.txt: security.txt expired 142 day(s) ago (2026-06-30T00:00:00.000Z). ...
[MEDIUM] Certificate: The newest certificate was issued 74 days ago out of 90. Automatic clients renew at about
              two thirds; this one has not. Renewal may be failing silently.
[MEDIUM] Certificate: A certificate from Sectigo Limited lasts 397 days, usually a sign it is bought and installed
              by hand. Public certificates are capped at 200 days now, 100 days from 2027-03-15 and 47 days from
              2029-03-15 (CA/Browser Forum).
[MEDIUM] security.txt: Contact "security@example.com" is not a URI. RFC 9116 needs mailto:, https:// or tel:.
...
Suggested CAA records (compare with yours):
  shop.example.com. CAA 0 issue "pki.goog"
  shop.example.com. CAA 0 issue "sectigo.com"
  shop.example.com. CAA 0 iodef "mailto:security@shop.example.com"
                                                           (exit code 1)
```

Two live runs on public domains (DNS and Certificate Transparency only) on 2026-11-18:

```text
$ node candado.js cloudflare.com --no-fetch
Candado 1.0.0 — cloudflare.com   grade A+ (100/100)   5 DNS queries
DNSSEC  signed and validating   DS: 2371 13 2 3299...
Cert    Google Trust Services, issued 2026-10-12, expires 2027-01-10 (53 days left, 90-day lifetime)
No findings.

$ node candado.js dnssec-failed.org --no-fetch          # a test domain kept broken on purpose
[HIGH  ] DNSSEC: DNSSEC is broken: validating resolvers (Google, Cloudflare, most mobile carriers) answer
              SERVFAIL ... Resolver says: EDE(9): DNSKEY Missing no SEP matching the DS found for dnssec-failed.org.
[HIGH  ] CAA: The CAA lookup for dnssec-failed.org failed (SERVFAIL). CAs must refuse to issue when this lookup
              fails, so renewals will fail until it is fixed.
```

## Run

```sh
node candado.js yourbusiness.com --lang es
node candado.js yourbusiness.com [--json] [--ics reminder.ics] [--fail-on high|medium|low|never] [--no-fetch]
npm test        # 15 tests, node:test, no install step
```

Node 18+, zero dependencies. Exit codes: `0` ok, `1` findings at or above `--fail-on` (default `high`), `2` usage or DNS error. If a proxy or antivirus inspects HTTPS on your computer, run it as `node --use-system-ca candado.js ...`. Offline mode for tests and CI: `--zone zone.json --ct crtsh.json --security-txt file.txt --now 2026-11-18`.

## Who it is for

The owner of a small business, or the person who runs its website, shop or hosting panel. You do not need to know what CAA or DNSSEC mean: every finding says what breaks, for whom, and the exact line to change.

## What it checks

- **Certificate (from Certificate Transparency, via crt.sh):** the newest valid certificate for your domain, days left, whether automatic renewal looks stuck (no new certificate after about two thirds of its life), certificates with long lifetimes that are renewed by hand (capped at 200 days today, 100 days from 2027-03-15, 47 days from 2029-03-15), and an `.ics` calendar reminder 10 days before expiry. BIMI mark certificates (VMC) are ignored.
- **CAA (RFC 8659):** finds the CAA set that applies (climbing to parent domains like a CA does), and flags issuer names that no CA uses (checked against the official CCADB list, with a "did you mean" suggestion such as `actalis.com` → `actalis.it`), values with extra quotes, critical unknown tags that stop all issuance, bad `iodef`, unknown `validationmethods` (RFC 8657), and a failed CAA lookup. **Then it checks that your CAA allows the CA that issued your current certificate** (normal and wildcard): if not, your next renewal will be refused. It writes CAA records for you from the CAs you actually use.
- **DNSSEC:** signed and validating; broken (validating resolvers say SERVFAIL but the name resolves with validation off, the classic "DS left at the registrar after changing DNS provider"), with the resolver's Extended DNS Error; signed but DS missing at the registrar; off (optional).
- **security.txt (RFC 9116):** `Contact` present and a URI, `Expires` present, once, valid, not expired and less than a year ahead, a `Canonical` copied from another site, HTML served instead of the file, PGP-signed files. It gives you a ready template.

## Why it exists

- Let's Encrypt stopped sending expiry emails on 2025-06-04 ([announcement](https://letsencrypt.org/2025/01/22/ending-expiration-emails/)), and in its community forum people still find out about a broken renewal only when the site is down ([example, April 2026](https://community.letsencrypt.org/t/getting-an-email-when-certificates-are-about-to-expire/246540)).
- Certificate lifetimes are shrinking to 47 days by 2029 ([CA/Browser Forum ballot SC-081v3](https://cabforum.org/2025/04/11/ballot-sc081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/), [Baseline Requirements 2.3.1](https://cabforum.org/working-groups/server/baseline-requirements/requirements/)). Anything renewed by hand will break.
- Real CAA mistakes block renewals: a wrong issuer name ([`actalis.com` instead of `actalis.it`](https://community.letsencrypt.org/t/blocking-caa-record-s-found-on-one-or-more-of-the-specified-domains/245743)) or extra quotes ([forum thread](https://community.letsencrypt.org/t/acme-challenge-wont-complete-until-permissive-caa-dns-record-is-deleted/241173)). Existing tools check CAA, DNSSEC, certificates and security.txt separately, mostly in English, often server-side; none of the nine we reviewed cross-checks your CAA against the CA that renews you. Details and all 30 sources in [RESEARCH.md](RESEARCH.md).

## Privacy and safety

Passive and read-only. The browser demo asks public DNS (Cloudflare DNS-over-HTTPS, Google as fallback) and crt.sh about the domain you type; nothing else leaves your computer, there is no server and no account. The CLI also makes one GET to `https://yourdomain/.well-known/security.txt` (skip it with `--no-fetch`). Use it on your own domains or ones you manage.

## Limitations

- Certificate Transparency shows what was **issued**, not what your server **sends**. A server can still send an old certificate after a renewal; look at the padlock in your browser if in doubt.
- crt.sh is a free public service and is often slow or down (it returned 502 during development). When it does not answer, the certificate and cross-checks are skipped with a note; try again later.
- The CA-to-CAA mapping covers the ~30 CAs that issue most website certificates (taken from the CCADB list on 2026-11-18). For other CAs the tool says it cannot tell instead of guessing. If your hosting or CDN uses several CAs (Cloudflare does), your CAA must allow all of them.
- DNSSEC checks rely on the answer of public validating resolvers (AD flag, SERVFAIL, `cd=true`); they do not replace a full chain analysis like DNSViz.
- Browsers cannot read another site's security.txt (CORS): in the demo you paste it.
- Only the domain and `www.` are cross-checked; other subdomains need their own run.

---
Daily Security Lab · Experiment 102 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
