# Recuento

Those daily emails with a `.zip` from Google titled "Report domain" are not a scam: drop them here and see who sends mail as your domain, what to fix, and whether you can tighten your DMARC policy.

En español: suelta los informes DMARC que te llegan por correo (`.xml`, `.gz`, `.zip` o el correo guardado) y Recuento te dice quién envía con tu dominio, qué arreglar y si ya puedes pasar a `quarantine` o `reject`.
Funciona en tu navegador, sin cuenta y sin subir nada.

**Live demo:** https://freyesperales.github.io/dev-experiments-365/experiments/experiment-107/ (add `?lang=es` for Spanish)

## Sample run

`node recuento.js --demo shop` runs on 53 invented reports (a month of mail for `example.com`, a shop whose newsletter tool was never set up with the shop's domain):

```
Recuento 1.0.0  ·  example.com  ·  53 reports from 3 receivers · 2026-10-20 → 2026-11-19 (31 days)

>> NOT YET: FIX THESE SENDERS FIRST
   2,503 messages (66.6%) come from services that send for you but do not prove it. If you moved to quarantine or reject today, they would go to spam or bounce.

Policy you publish: p=none (monitoring only: receivers are asked to block nothing)
3,760 messages used your domain · 1,195 passed DMARC (31.8%) · 2,565 failed (2,565 delivered anyway)

[FIX]     2,503   66.6%  SendGrid (sendgrid.net) sends for you without your domain
        A service you (or someone in the company) set up is sending as example.com, and authenticates as sendgrid.net instead. Receivers cannot tell it from a forgery.
        Do: in SendGrid, look for "domain authentication", "custom DKIM" or "sender domain", and publish the DNS records it gives you. If nobody in the company uses SendGrid, leave it failing: it is not yours.
        Authenticated as: DKIM sendgrid.net (smtpapi) pass; SPF sendgrid.net pass
        Seen from: 198.51.100.24 (2,503)
[CHECK]      40    1.1%  No proof at all that this mail is yours
        These messages said they were from example.com and had no valid SPF or DKIM of yours. Usually somebody forging your address; sometimes a system of yours that nobody remembers (web site form, printer or scanner, old server, invoicing program).
        40 were delivered anyway: p=none blocks nothing.
        Do: look at the addresses below. If one is yours, add it to SPF or make it sign. The rest is what quarantine and reject are for.
        Authenticated as: SPF example.com fail
        Seen from: 203.0.113.142 (5), 203.0.113.146 (5), 203.0.113.150 (5), 203.0.113.154 (5), 203.0.113.158 (5) and 3 more
[INFO]       22    0.6%  Forwarded mail and mailing lists, recognised by the receiver
        The receiver itself marked these as forwarded or list mail and did not apply your policy to them. Nothing to fix.
        Authenticated as: DKIM example.com (google) fail; SPF forwarder.example.net pass
        Seen from: 203.0.113.77 (22)
[OK]      1,195   31.8%  Signed as example.com (selector google) — DKIM and SPF pass

What to do next
1. Fix: SendGrid (sendgrid.net) sends for you without your domain — 2,503 messages.
2. Then wait for new reports (they arrive once a day) and run them through here again. Do not change the policy before the list above is empty.

Notes
- 6 reports use the new format of RFC 9990 (May 2026). Some older readers reject it; it is read here the same as the old one.
- "Fail" here does not mean "rejected". With p=none, 2,565 failing messages were delivered as usual.

Who sent these reports: google.com (31, 3,538) · Outlook.com (16, 204) · Receiver Example (6, 18)

53 reports read
```

The exit code is 1 because there is something to fix.

## Install and run

No install. Node 18 or newer, one file:

```
node recuento.js reports/                 # a folder with everything you saved
node recuento.js report.xml.gz other.zip  # or single files: .xml, .xml.gz, .zip, .eml
node recuento.js reports/ --lang es       # Spanish
node recuento.js reports/ --json          # for scripts
node recuento.js reports/ --min-days 14   # days of clean reports asked before "ready" (default 30)
node recuento.js --demo shop              # invented reports: shop, ready, blocked, week
```

Exit codes: 0 nothing to fix, 1 something to fix or identify, 2 usage or input error.

## Who it is for

The owner of a small business, or the person who looks after its website and email, who published a DMARC record with `rua=` (often because Google or Microsoft asked for it) and now receives attachments nobody reads.

## What it does

- **Opens what actually arrives.** The format is decided by the first bytes, not by the file name: gzip, gzip applied twice, gzip with stray bytes after it, zip, a zip named `.gz`, the saved email with the report attached, or plain XML. Files that are not DMARC reports are named for what they are (a TLS report, an empty placeholder, a web page).
- **Reads both formats.** RFC 7489 Appendix C, which large providers still send (often without a namespace), and RFC 9990, published in May 2026 (`urn:ietf:params:xml:ns:dmarc-2.0`, with `np`, `testing`, `discovery_method`, and `pass` as a disposition).
- **Groups by who sent, not by IP.** Mail that passes as you; services that send for you but authenticate as themselves (the thing to fix); Google Workspace or Microsoft 365 signing with their default domain; forwarded mail; your own signature broken; and mail with no proof at all.
- **Answers the question.** One verdict per domain: mail of yours is being blocked, fix first, identify first, keep collecting, ready for the next step, or protected. Then the steps in order.
- **Clears up the usual confusion.** "Fail" is not "rejected", the policy you publish is not what the receiver did, and `pct` no longer exists in RFC 9989 (`t=y` replaces `pct=0`).

## Why it exists

- People take these emails for a scam or delete them. A shop owner gets a daily "Report domain … Submitter: google.com" and does not know what it is ([Shopify Community, 2024](https://community.shopify.com/t/report-domain-google-email-jeden-tag/311049)). Another admin writes "I don't understand what is wanted from me" ([Microsoft Q&A, 2023](https://learn.microsoft.com/en-sg/answers/questions/1470050/this-is-a-dmarc-aggregate-report-from-microsoft-co)).
- The files break readers: gzip applied twice ([dmarc-report-converter #22](https://github.com/tierpod/dmarc-report-converter/issues/22)), a trailing CRLF after the gzip data ([parsedmarc #429](https://github.com/domainaware/parsedmarc/issues/429)), attachments that contain only the word "unused" ([parsedmarc #409](https://github.com/domainaware/parsedmarc/issues/409)).
- The format changed in May 2026 ([RFC 9990](https://www.rfc-editor.org/rfc/rfc9990.html)), and a validator built for the old schema already rejected a new-format report ([Stalwart forum, 2026-08](https://support.stalw.art/t/dmarc-invalid-report-schema-causing-loop/1250)).

The readers that exist today need an account and your reports redirected to them, or show a table per IP and stop there, or need a server to install. All sources are in [RESEARCH.md](RESEARCH.md).

## Limitations

- A report says which servers sent mail and how it authenticated. It never contains the messages, the sender's mailbox or the recipients.
- The names of sending services (SendGrid, Mailchimp, Google Workspace's default key and so on) come from a short list written into the tool. That list was not checked against each provider's documentation in this run. A service that is not on it shows up as "authenticated as a domain that is not yours", for you to identify.
- "Is this domain yours" means "equal to, or under, the domain in the report's policy". It does not use the Public Suffix List or the DNS tree walk.
- The verdict is a rule of thumb: nothing of yours failing over 30 days of reports. The 30 days are this tool's choice, not a number from the RFCs. Mail you send once a quarter may not be in the reports yet.
- Forwarding is inferred from the receiver's own reason codes, or from a mailbox provider passing SPF while your signature failed. Without the message nobody can be certain.
- It looks nothing up: no reverse DNS for the IP addresses, no check of your current DNS record. For that, see [Remitente](../experiment-106/).
- gzip checksums are not verified (only the stored length), zip64 and password-protected zips are skipped, and files that expand beyond 64 MB are refused.
- Aggregate reports only. Failure reports (RFC 9991) and TLS reports (RFC 8460) are recognised and skipped.

## Tests

`npm test` (or `node --test test/*.test.js`): 32 tests. The built-in decompressor is compared with Node's zlib; every archive shape above is built and read; the RFC 9990 Appendix B sample is read field by field; each sender category and each verdict has its own case. All data is invented (`example.com`, documentation IP ranges).

## License

MIT

---

Daily Security Lab · Experiment 107 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
