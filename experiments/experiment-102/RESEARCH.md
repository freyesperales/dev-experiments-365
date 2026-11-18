# Research — Experiment 102 (Wednesday: web hygiene)

Date of run: 2026-11-18 (UTC). Lane: Wednesday, web hygiene. HTTP security headers were already covered this month
(Headerfix, experiments 096 and 099), so this run looked at the other half of the lane: TLS certificates, CAA,
DNSSEC and security.txt.

Method: three parallel scouts with live web search and fetch (what is changing, real defender pain, what already
exists), then the main agent re-checked the facts the tool depends on: the certificate lifetime schedule was read
in the CA/Browser Forum Baseline Requirements v2.3.1 (section 1.2.2), the CAA issuer names were downloaded from the
CCADB "All CAA Identifiers" report (CSV, 73 CA owners), and the behaviour of crt.sh and of the Cloudflare and Google
DNS-over-HTTPS JSON APIs (CORS header, AD flag, CAA answers, SERVFAIL plus Extended DNS Error on a broken DNSSEC
domain, `cd=true`) was measured with curl. Every link below was opened during this run.

## Sources fetched in this run (accessed 2026-11-18)

### What is changing (primary sources)
| # | Type | URL | Source date | Takeaway |
|---|------|-----|-------------|----------|
| 1 | primary (industry standard) | https://cabforum.org/working-groups/server/baseline-requirements/requirements/ | v2.3.1, 2026-10-04 | Section 1.2.2: maximum validity of subscriber certificates is 200 days from 2026-03-15, 100 days from 2027-03-15 and 47 days from 2029-03-15. Read by the main agent. |
| 2 | primary (ballot) | https://cabforum.org/2025/04/11/ballot-sc081v3-introduce-schedule-of-reducing-validity-and-data-reuse-periods/ | vote 2025-04-04 to 04-11 | SC-081v3: validity goes from 398 to 47 days between March 2026 and March 2029; domain validation reuse from 398 to 10 days. Passed (25 CAs yes, 0 no, 5 abstain; Apple, Google, Microsoft and Mozilla yes). |
| 3 | primary (CA blog) | https://letsencrypt.org/2025/01/22/ending-expiration-emails/ | 2025-01-22 | Let's Encrypt stopped sending expiry reminder emails on 2025-06-04. Nobody warns you any more if renewal breaks. |
| 4 | primary (CA blog) | https://letsencrypt.org/2025/12/02/from-90-to-45 | 2025-12-02 | Default ("classic") profile goes to 64 days on 2027-02-10 and 45 days on 2028-02-16. |
| 5 | primary (CA page) | https://letsencrypt.org/upcoming-features/ | updated 2026-07-22 | Confirms the 64/45-day dates and the end of expiry emails. |
| 6 | primary (CA blog) | https://letsencrypt.org/2024/12/05/ending-ocsp/ | 2024-12-05 | No OCSP URL in certificates since 2025-05-07; OCSP servers off since 2025-08-06. (Context; not used as a rule.) |
| 7 | primary (root program) | https://googlechrome.github.io/chromerootprogram/crp/policy | v1.8, 2026-02-05 | Leaf certificates issued from 2027-03-15 may carry only serverAuth. (Context; not used as a rule.) |
| 8 | primary (standard) | https://www.rfc-editor.org/rfc/rfc8659.html | November 2019 | CAA: `issue`, `issuewild`, `iodef`; tree climbing to the closest CAA set; unknown property with the critical flag means the CA must not issue. |
| 9 | primary (standard) | https://www.rfc-editor.org/info/rfc9495 | October 2023 | `issuemail` for S/MIME certificates (does not restrict TLS issuance). |
| 10 | primary (standard) | https://www.rfc-editor.org/rfc/rfc9116.html | April 2022 | security.txt at `/.well-known/security.txt` over HTTPS; `Contact` required; `Expires` required, once, recommended less than a year ahead. |
| 11 | primary (CA database) | https://ccadb.my.salesforce-sites.com/ccadb/AllCAAIdentifiersReportCSV | live report, downloaded 2026-11-18 | Official CAA issuer names per CA owner (e.g. Actalis = `actalis.it`, Google Trust Services = `pki.goog`, SSL.com = `ssl.com`, Sectigo = `sectigo.com`, `comodoca.com`...). Embedded in the tool for the "is this a real CA name" and "does your CAA allow your current CA" checks. |

### Real defender pain
| # | Type | URL | Source date | Takeaway |
|---|------|-----|-------------|----------|
| 12 | forum (CA community) | https://community.letsencrypt.org/t/getting-an-email-when-certificates-are-about-to-expire/246540 | 2026-04-12 | Renewal stopped after a package was removed by accident; the owner only found out from an external monitor and was told the emails no longer exist. |
| 13 | forum (CA community) | https://community.letsencrypt.org/t/clarification-for-ending-support-for-expiration-notification-emails/236056 | 2025-04-07 | Confusion about which warnings still exist after the change. |
| 14 | forum (CA community) | https://community.letsencrypt.org/t/blocking-caa-record-s-found-on-one-or-more-of-the-specified-domains/245743 | 2026-03-06 | CAA had `issue "actalis.com"`; the right name is `actalis.it`. Issuance blocked. This exact typo is a test case in Candado. |
| 15 | forum (CA community) | https://community.letsencrypt.org/t/acme-challenge-wont-complete-until-permissive-caa-dns-record-is-deleted/241173 | 2025-09-08 | CAA "allowed" Let's Encrypt but had extra quotes and two DNS providers disagreed; only deleting the CAA worked. Basis for the extra-quotes check. |
| 16 | forum (CA community) | https://community.letsencrypt.org/t/dnssec-not-provisioned-in-godaddy-but-required-by-cloudflare-challenges-dont-pass/37820 | 2017-07-10 (old, still the typical case) | A DS from the previous DNS provider left at the registrar gave SERVFAIL; fixed by removing the DS. |
| 17 | forum | https://discourse.mailinabox.email/t/adding-ds-records-makes-miab-inaccessible/10449 | 2023-05-14 | DS added at the registrar while the DNS provider did not sign: the site stopped loading. |
| 18 | vendor blog (sells monitoring; interested party) | https://uriports.com/blog/security-txt-in-2025 | 2025-01-24 | In the top 1 million domains only 1.25% publish security.txt; of those, 45% lack `Expires` and 13% are expired. |

### What already exists and why it falls short
| # | Type | URL | Source date | Takeaway |
|---|------|-----|-------------|----------|
| 19 | tool | https://www.ssllabs.com/ssltest/ | no date | TLS and certificate only, server-side (the domain goes to Qualys), results on public boards unless you opt out, English. |
| 20 | tool | https://crt.sh/ | no date | Raw CT search, no expiry warnings; returned 502 during this run (unstable; the tool degrades gracefully). |
| 21 | tool | https://dnsviz.net/ | no date | DNSSEC only, expert graph. |
| 22 | tool | https://dnssec-debugger.verisignlabs.com/ | © 2011-2026 | DNSSEC only, advanced options. |
| 23 | tool | https://sslmate.com/caa/ | no date | CAA generator only; does not cross-check the CA of your current certificate. |
| 24 | tool | https://securitytxt.org/ | no date | Generates security.txt; does not validate a published file; English only. |
| 25 | tool | https://internet.nl/ | no date | The most complete (DNSSEC, CAA, TLS), but server-side, English/Dutch, no certificate expiry or renewal view. |
| 26 | tool | https://www.hardenize.com/ | no date | Free public report pushes to a paid monitoring trial. |
| 27 | tool docs | https://developer.mozilla.org/en-US/observatory/docs/faq | no date | HTTP Observatory focuses on headers; per-domain history is public. |

### Technical feasibility (measured with curl on 2026-11-18)
| # | URL | Result |
|---|-----|--------|
| 28 | https://crt.sh/?q=example.com&output=json&exclude=expired | HTTP 200, `Access-Control-Allow-Origin: *`, JSON with `issuer_name`, `name_value`, `not_before`, `not_after`, `serial_number` (precertificate and final certificate appear as two rows with the same serial). |
| 29 | https://cloudflare-dns.com/dns-query?name=cloudflare.com&type=CAA (accept: application/dns-json) | `AD:true`, CAA answers as `0 issue "letsencrypt.org"`. For `dnssec-failed.org`: Status 2 (SERVFAIL) with `EDE(9): DNSKEY Missing no SEP matching the DS`; with `cd=true` Status 0 and the A record. That pair is how Candado proves "your DNSSEC is broken" rather than "your DNS is down". |
| 30 | https://dns.google/resolve?name=dnssec-failed.org&type=A | Same SERVFAIL, `extended_dns_errors` info_code 9. |

A real-domain run also found that crt.sh lists BIMI "Verified Mark" certificates next to TLS certificates (a DigiCert
VMC on cloudflare.com, 368 days); without filtering them the tool reported a false "manual renewal" warning. They
are now excluded and there is a test for it.
A second live run (on the published demo, example.com) showed two more kinds of noise in crt.sh: rows whose issuer is
"Issuer Not Found" (not a publicly trusted CA) and a test intermediate whose name contains the domain after a space.
crt.sh separates names with newlines, so names are now split only on newlines, and "Issuer Not Found" rows are skipped.

## Candidates and judge

Scores 1–5: usefulness to a small business × freshness × feasibility in one run × shareability.

| Candidate | Use | Fresh | Feasible | Share | Total | Notes |
|---|---|---|---|---|---|---|
| **A. One-domain check of CAA + DNSSEC + certificate (CT) + security.txt, with "your CAA blocks the CA that renews you" cross-check and an .ics expiry reminder** | 5 | 5 | 4 | 5 | **500** | Fills the gap left by the end of Let's Encrypt emails and the 200/100/47-day schedule; covers the three failure modes seen in the forums (wrong CAA name, extra quotes, orphan DS). All data sources answer with CORS `*`. |
| B. CAA generator/auditor only | 4 | 3 | 5 | 3 | 180 | SSLMate already generates CAA. |
| C. Certificate lifetime calculator (paste PEM) | 3 | 5 | 5 | 3 | 225 | Pasting a PEM is too technical for the audience. |
| D. security.txt validator only | 3 | 3 | 5 | 3 | 135 | Folded into A. |

**Pick: A — "Candado".** Nothing in the ledger covers CAA, DNSSEC, CT or security.txt (086–101).

## Assumptions and limits written down during research
- Certificate Transparency shows what was issued, not what the server sends. The tool says so in the output.
- The issuer-to-CAA mapping covers the CAs that issue most small-business certificates; unknown issuers get a
  "check by hand" note instead of a guess.
- Browsers cannot read another site's `/.well-known/security.txt` (no CORS), so the demo asks the user to paste it;
  the CLI fetches it with one GET.
- Not verified this run and therefore not used as rules: the intermediate domain-validation reuse dates, DNS-PERSIST-01
  availability, Let's Encrypt 6-day certificates (seen only in a search snippet).
