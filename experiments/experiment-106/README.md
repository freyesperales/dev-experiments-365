# Remitente 1.1

Type your domain and see whether Gmail, Outlook and Yahoo will trust your email, and whether someone can send mail pretending to be you. You get the exact DNS line to fix each problem.

En español: escribe tu dominio y revisa SPF, DMARC, DKIM y MTA-STS como los revisan Gmail, Outlook y Yahoo, con el arreglo exacto para cada problema. La versión 1.1 resuelve bien los subdominios, revisa los dominios que no envían correo y explica los registros dañados al copiar y pegar.

**Live demo (runs in your browser):** https://freyesperales.github.io/dev-experiments-365/experiments/experiment-106/ — add `?d=yourdomain.com` to share a check.

**New in 1.1** (maintenance release of [Experiment 100](../experiment-100/); rules checked against RFC 9989, RFC 7505, RFC 7208, M3AAWG and GOV.UK, and against real support threads, all opened on 2026-11-22, see [`RESEARCH.md`](RESEARCH.md)):

- **Fixed: subdomains.** 1.0 looked for DMARC only two labels up, so `news.mail.shop.example.com` was reported as "no DMARC" even when `example.com` had a record. 1.1 implements the DNS Tree Walk of RFC 9989 section 4.10: every parent up to the top-level domain, at most 8 queries, `psd=n` and `psd=y` honoured, two records at one name discarded. It shows each name receivers ask, and the policy the subdomain really gets (`sp=` or `p=`), including inherited strict alignment.
- **New: domains that send no mail.** A domain with `v=spf1 -all` and no MX is treated as what it declares. SPF alone does not stop forged mail there, because SPF never looks at the From address people see: 1.1 asks for DMARC `p=reject` and a null MX (`0 .`, RFC 7505), prints a checklist of what is published and what is missing, and stops guessing 14 DKIM selectors (5 DNS queries instead of 19). A domain with no MX and no SPF gets the same records as an offer, with a warning not to use them if anyone sends from it.
- **New: DMARC at the wrong name.** A `v=DMARC1` record on the bare domain, or at `_dmarc.example.com.example.com` (the DNS panel appended the domain twice), is found and explained instead of "no DMARC".
- **New: copy-paste damage.** A line break pasted after `-all`, curly quotes or a non-breaking space, a record that starts with a quote, `v=spf1` twice in one record, `include domain.com` with a space, `ip4:1.2.3.4~all` without a space. Each one has its own message and fix.
- **New: null MX mistakes.** A null MX published next to a real MX (forbidden by RFC 7505), or with a preference other than 0.
- **Fixed:** `include` without a domain was counted as a lookup and produced no finding.
- 32 tests (16 → 32).

## Sample run

```text
$ node remitente.js parked.example --zone fixtures/parked-zone.json
Remitente 1.1.0 — parked.example   grade B (72/100)   5 DNS queries

MX     none
SPF    v=spf1 -all
       DNS lookups: 0/10   void: 0/2
DMARC  v=DMARC1; p=none
DKIM   not needed: this domain sends no mail
MTA-STS none   TLS-RPT none

Sender requirements of Gmail / Yahoo / Outlook do not apply: this domain declares that it sends no mail.

[HIGH  ] DMARC: parked.example declares that it sends no mail (v=spf1 -all), but its DMARC policy is "none". SPF does not
         look at the From address people see, so forged mail "from" this domain can still be delivered. Only DMARC
         p=reject closes that.
         Fix: Publish at _dmarc.parked.example: v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s
[LOW   ] MX: parked.example sends no mail and has no MX. A "null MX" (RFC 7505) says so explicitly, so senders fail at
         once instead of retrying against your web server for days.
         Fix: Add an MX record with priority 0 and target "." (a single dot). Some DNS panels do not allow it; in that
         case leave it.

Domain that sends no mail: lockdown checklist
  OK    parked.example  TXT  v=spf1 -all
  ADD   _dmarc.parked.example  TXT  v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s
  ADD   parked.example  MX  0 .
  opt   *.parked.example  TXT  v=spf1 -all
  opt   *._domainkey.parked.example  TXT  v=DKIM1; p=
                                                           (exit code 1)

$ node remitente.js news.mail.shop.example.com --zone fixtures/parked-zone.json --fail-on never
Remitente 1.1.0 — news.mail.shop.example.com   grade A (87/100)   23 DNS queries
DMARC  v=DMARC1; p=reject; sp=none; adkim=s; aspf=s; rua=mailto:dmarc@example.com  (from example.com)
       tree walk: _dmarc.news.mail.shop.example.com [-]  _dmarc.mail.shop.example.com [-]  _dmarc.shop.example.com [-]
                  _dmarc.example.com [found]  _dmarc.com [-]   policy here: none (sp=)
[MEDIUM] DMARC: Subdomain policy sp=none is weaker than p=reject: attackers can forge any subdomain ...
[INFO  ] DMARC: No DMARC record on news.mail.shop.example.com itself. Receivers walk up the DNS tree (RFC 9989) and apply
         the record of example.com: the policy for this subdomain is "none" (taken from sp=). It also inherits strict
         alignment (adkim=s, aspf=s): mail signed with another subdomain fails.
```

Long lines are wrapped here for reading. Both runs use the local fixtures in `fixtures/`; no real domain was queried to build or test this release.

## Run

```sh
node remitente.js yourbusiness.com --lang es
node remitente.js yourbusiness.com [--json] [--selector google,s1] [--headers email.txt]
                                   [--policy mta-sts.txt | --fetch-policy] [--fail-on high|medium|low|never]
npm test        # 32 tests, node:test, no install step
```

Node 18+, zero dependencies. Exit codes: `0` ok, `1` findings at or above `--fail-on` (default `high`), `2` usage or DNS error. If a proxy or antivirus inspects HTTPS on your computer, run it as `node --use-system-ca remitente.js ...`.

## What it checks

- **SPF (RFC 7208):** the real lookup count, following every `include` and `redirect` the way receivers do (limit 10), "void" lookups (limit 2), two SPF records (it proposes one merged record), `ip:` typos, invalid IPs, `+all`, `?all`, missing `all`, `ptr`, includes that no longer have SPF, loops and duplicate includes. *1.1:* control characters, non-ASCII characters, a record that does not start with `v=spf1`, `v=spf1` repeated, `include` with a space, `all` glued to the previous term.
- **DMARC (RFC 9989, May 2026):** missing or duplicate record, `p=none` without reports, a subdomain policy weaker than `p`, `pct`/`rf`/`ri` removed by RFC 9989 (and `pct=0` → `t=y`), `t`, `np`, `psd`, invalid values, unknown tags, and report addresses on another domain that has not authorised them. It writes a cleaned record for you. *1.1:* the Tree Walk for subdomains, the policy that really applies, a record published at the wrong name, a registry-level (`psd=y`) record being the only one, repeated tags, pasted characters.
- **DKIM:** looks for keys on 14 common selectors, or on the selector in a `DKIM-Signature` header you paste, and reads the real RSA key size (Gmail requires 1024 bits, recommends 2048). Revoked and test-mode keys are flagged.
- **MTA-STS (RFC 8461) and TLS-RPT (RFC 8460):** TXT records, `id`, policy `mode`, `max_age` and whether the policy's `mx:` lines really cover your MX hosts.
- **Domains that send no mail** *(1.1)*: `v=spf1 -all`, DMARC `p=reject`, null MX, and the two optional wildcard records.
- **Sender requirements:** a checklist of what Gmail, Yahoo and Outlook require that can be seen in DNS.

## Who it is for

A small business owner, or whoever looks after the domain, website or email. Two typical cases for 1.1: you own extra domains (the `.com` next to your `.cl`, an old brand, a campaign domain) that never send mail and nobody protected; or your newsletter goes out from a subdomain and you do not know which DMARC policy it gets.

## Why it exists

- The most repeated problems in the support threads we read are two SPF records on one name, no DMARC at all, and DMARC published at the wrong name ([Server Fault, 2025](https://serverfault.com/questions/1172428/difficulty-with-dns-records-specifically-related-to-sending-email); [Cloudflare Community, 2026-11-16](https://community.cloudflare.com/t/spf-permerror-unexpected-x0a-in-dns-record/981221), where one checker reported a pasted line break as a permanent error and another called the record valid).
- RFC 9989 replaced the Public Suffix List with a DNS Tree Walk ([section 4.10](https://www.rfc-editor.org/rfc/rfc9989.html#section-4.10)), which changes which record a subdomain gets.
- For domains that send no mail, the two public guides do not fully agree: [GOV.UK](https://www.gov.uk/guidance/protect-domains-that-dont-send-email) recommends an empty wildcard DKIM key, while [M3AAWG](https://www.m3aawg.org/sites/default/files/m3aawg_parked_domains_bcp-2022-06.pdf) says a parked domain needs no DKIM record. Remitente requires what both agree on (SPF `-all`, DMARC reject, null MX) and marks the rest as optional.

## Privacy and safety

The browser version asks public DNS-over-HTTPS (Cloudflare, Google as fallback) for the domain's records. That is the only network traffic, besides an optional attempt to read your own MTA-STS policy file. There is no server, no account and no tracking. It is read-only: it never sends mail or touches the domain.

## Limitations

- DNS can only show part of the picture. Alignment, one-click unsubscribe, spam rate and whether your provider really signs with DKIM are only visible in real messages.
- DKIM selectors cannot be listed. "Not found on common selectors" does not mean you have no DKIM; paste a `DKIM-Signature` header to check yours.
- "Sends no mail" is read from what the domain declares (`v=spf1 -all` and no MX). The tool cannot know whether someone does send from it; the checklist says so when the domain has not declared it.
- The Tree Walk is the RFC 9989 method. Receivers that still follow RFC 7489 use the Public Suffix List instead; for an ordinary business domain both give the same answer.
- `np=` applies to names that do not exist; the tool reports it but does not test whether a subdomain exists.
- Not checked: BIMI, DNSSEC, DANE, the obsolete SPF record type 99, a TXT next to a CNAME at `_dmarc`, and TXT strings longer than 255 bytes (DNS-over-HTTPS JSON does not keep the string boundaries reliably, and that check is a known source of false alarms in other tools).
- The SPF count follows the RFC, but macros (`%{...}`) and `exists` cannot be resolved ahead of time; they are counted, not expanded.
- Browsers usually cannot read the MTA-STS policy file (CORS); paste it, or use `--fetch-policy` in the CLI.

Daily Security Lab · Experiment 106 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
