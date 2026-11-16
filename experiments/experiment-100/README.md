# Remitente

Type your domain and see whether Gmail, Outlook and Yahoo will trust your email, and whether someone can send mail pretending to be you. You get the exact DNS line to fix each problem.

En español: escribe tu dominio y revisa SPF, DMARC, DKIM y MTA-STS como los revisan Gmail, Outlook y Yahoo, con el arreglo exacto para cada problema. Corre en tu navegador, sin cuenta; solo consulta el DNS público.

**Live demo (runs in your browser):** https://freyesperales.github.io/dev-experiments-365/experiments/experiment-100/ — add `?d=yourdomain.com` to share a check.

## Sample run

```text
$ node remitente.js example.com --zone fixtures/bad-zone.json --policy fixtures/mta-sts-bad.txt
Remitente 1.0.0 — example.com   grade F (0/100)   34 DNS queries

SPF    v=spf1 a mx include:spf.crm.example.net include:spf.news.example.net ... ptr ~all
       DNS lookups: 18/10   void: 4/2
         include:spf.crm.example.net  [4]
         include:spf.news.example.net  [3]
           include:old.news.example.net  [1]  (no SPF)
         ...
DMARC  v=DMARC1; p=none; pct=50; rf=afrf; ri=86400; rua=mailto:reports@dmarc.example.org; aspf=x

[HIGH  ] SPF: 2 SPF records on example.com. RFC 7208 says that is a permanent error: receivers treat SPF as broken.
         Fix: Delete them and publish a single merged record (ptr removed, ip: corrected; check it before publishing):
              v=spf1 a mx include:spf.crm.example.net ... ip4:203.0.113.5 ~all
[HIGH  ] SPF: SPF needs 18 DNS lookups; the limit is 10. Receivers stop at 10 and return "permerror" ...
[HIGH  ] DMARC: Reports go to dmarc.example.org, but dmarc.example.org does not authorise it (no TXT at
              example.com._report._dmarc.dmarc.example.org). Receivers will not send those reports.
[HIGH  ] MTA-STS: Your MX mx.mailhost.example.net, backup.example.com are not covered by the policy's mx: lines.
              With mode: enforce, senders will refuse to deliver to them.
[MEDIUM] DMARC: pct=50: receivers applied partial percentages inconsistently and RFC 9989 removed the tag ...
[INFO  ] DMARC: rf= is obsolete since RFC 9989 and is ignored.
...
Suggested DMARC record (_dmarc.example.com):
  v=DMARC1; p=none; rua=mailto:reports@dmarc.example.org; t=y
                                                           (exit code 1)

$ node remitente.js example.org --zone fixtures/good-zone.json --selector s1 --policy fixtures/mta-sts-good.txt
Remitente 1.0.0 — example.org   grade A+ (100/100)   7 DNS queries
No findings.                                               (exit code 0)
```

A live run on a real domain (`node --use-system-ca remitente.js gmail.com --selector 20230601`) correctly reported `p=none`, the `redirect=` SPF (1 of 10 lookups) and that the selector `20230601` is published with an empty, revoked key.

## Run

```sh
node remitente.js yourbusiness.com --lang es
node remitente.js yourbusiness.com [--json] [--selector google,s1] [--headers email.txt]
                                   [--policy mta-sts.txt | --fetch-policy] [--fail-on high|medium|low|never]
npm test        # 16 tests, node:test, no install step
```

Node 18+, zero dependencies. Exit codes: `0` ok, `1` findings at or above `--fail-on` (default `high`), `2` usage or DNS error. If a proxy or antivirus inspects HTTPS on your computer, run it as `node --use-system-ca remitente.js ...`.

## What it checks

- **SPF (RFC 7208):** the real lookup count, following every `include` and `redirect` the way receivers do (limit 10), "void" lookups (limit 2), two SPF records (it proposes one merged record), `ip:` typos, invalid IPs, `+all`, `?all`, missing `all`, `ptr`, includes that no longer have SPF, loops, and duplicate includes. It shows the include tree with the cost of each branch.
- **DMARC (RFC 9989, May 2026):** missing or duplicate record, `p=none` without reports, a subdomain policy weaker than `p`, `pct`/`rf`/`ri` removed by RFC 9989 (and `pct=0` → `t=y`), `t`, `np`, `psd`, invalid values, unknown tags, and report addresses on another domain that has not authorised them. It writes a cleaned record for you.
- **DKIM:** looks for keys on 14 common selectors, or on the selector in a `DKIM-Signature` header you paste, and reads the real RSA key size (Gmail requires 1024 bits, recommends 2048). Revoked and test-mode keys are flagged.
- **MTA-STS (RFC 8461) and TLS-RPT (RFC 8460):** TXT records, `id`, policy `mode`, `max_age` and whether the policy's `mx:` lines really cover your MX hosts (a wrong line in `enforce` mode makes senders refuse your mail).
- **Sender requirements:** a checklist of what Gmail, Yahoo and Outlook require that can be seen in DNS.

## Who it is for

A small business owner, or whoever looks after the domain, website or email. Typical case: you added Mailchimp, a CRM and a help desk on top of Google Workspace or Microsoft 365, and now some mail lands in spam. Check the domain, then send the fixes to whoever manages your DNS.

## Why it exists

- RFC 9989 replaced the DMARC standard in May 2026 and removed `pct`, `rf` and `ri` ([rfc-editor.org/info/rfc9989](https://www.rfc-editor.org/info/rfc9989)). Records and advice written before still use them.
- Gmail began rejecting non-compliant mail from November 2025 ([Google](https://support.google.com/a/answer/14229414)), and Outlook sends non-compliant bulk mail to Junk since May 2025 ([Microsoft](https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730)).
- The SPF 10-lookup limit is the most repeated complaint we found in admin forums ([example](https://techcommunity.microsoft.com/discussions/exchange_general/record-contains-too-many-lookups-spf-records/417193)). Good checkers exist, but they are Python CLIs, paid, require an account, or process your domain on their own server. Details and 23 sources in [`RESEARCH.md`](RESEARCH.md).

## Privacy and safety

The browser version asks public DNS-over-HTTPS (Cloudflare, Google as fallback) for the domain's records. That is the only network traffic, besides an optional attempt to read your own MTA-STS policy file. There is no server, no account and no tracking. It is read-only: it never sends mail or touches the domain.

## Limitations

- DNS can only show part of the picture. Alignment, one-click unsubscribe, spam rate and whether your provider really signs with DKIM are only visible in real messages.
- DKIM selectors cannot be listed. "Not found on common selectors" does not mean you have no DKIM; paste a `DKIM-Signature` header to check yours.
- The SPF count follows the RFC, but macros (`%{...}`) and `exists` cannot be resolved ahead of time; they are counted, not expanded.
- Browsers usually cannot read the MTA-STS policy file (CORS); paste it, or use `--fetch-policy` in the CLI.
- DMARC for subdomains walks up to two parent labels; it does not implement the full RFC 9989 tree walk.
- "Flattening" SPF is offered only as a last resort, because providers change their IPs.

Daily Security Lab · Experiment 100 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
