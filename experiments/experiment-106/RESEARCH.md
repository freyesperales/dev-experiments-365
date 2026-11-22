# Research — Experiment 106 (Remitente 1.1)

Lane: **Sunday maintenance** (2026-11-22, UTC). Tool improved: Remitente (experiment 100, email authentication).
All sources below were requested during this run, on 2026-11-22. Three research scouts ran in parallel (what changed in the rules; what real people struggle with; what other tools do). Sources marked **[lead]** were then requested again by the lead agent with `curl` (HTTP 200) and the fact quoted here was read in the response itself; the rest were opened by a scout through a summarising fetch tool, so they support the direction of a decision, not a literal quote.

P = primary source (standard, vendor or agency documentation, issue tracker, the thread itself). S = secondary.

## 1. What the rules say today

| Source | Date of source | Takeaway |
|---|---|---|
| P [lead] https://www.rfc-editor.org/rfc/rfc9989.txt | May 2026 | DMARC. Section 4.10: the "DNS Tree Walk" replaces the Public Suffix List. Remove one label at a time; with 8 or more labels jump to 7; never more than 8 queries; stop at `psd=n` or `psd=y`; several records at one name are all discarded. Section 4.10.1: a subdomain without its own record takes `sp=` (or `np=` if it does not exist), else `p=`. Section 4.10.2: `psd=n` wins, `psd=y` points one label below, otherwise the record with the fewest labels. |
| P https://www.rfc-editor.org/info/rfc9989 | May 2026 | Proposed Standard, obsoletes RFC 7489 and RFC 9091. |
| P https://datatracker.ietf.org/doc/draft-ietf-dmarc-dmarcbis/ | updated 2026-05-20 | Confirms publication of the draft as RFC 9989. |
| P https://www.rfc-editor.org/info/rfc9990 | May 2026 | DMARC aggregate reporting (companion document). |
| P https://www.rfc-editor.org/info/rfc9991 | May 2026 | DMARC failure reporting (companion document). |
| P [lead] https://www.rfc-editor.org/rfc/rfc7505.txt | June 2015 | Null MX is `MX 0 .`. Section 3: "A domain that advertises a null MX MUST NOT advertise any other MX RR." |
| P [lead] https://www.rfc-editor.org/rfc/rfc7208.txt | April 2014 | SPF: 10-lookup limit, 2 void lookups, the ABNF of a record (section 12). |
| P [lead] https://www.rfc-editor.org/rfc/rfc8301.txt | January 2018 | DKIM: RSA keys of at least 1024 bits (MUST), 2048 recommended; rsa-sha1 must not be used. No change needed in 1.1. |
| P https://www.rfc-editor.org/rfc/rfc8463.html | September 2018 | DKIM `k=ed25519`. Already handled since 1.0 (no key-size finding for it). |
| P https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-spec/ | draft -09, 2026-11-01 | DKIM2 is still an Internet-Draft, not a standard: nothing to check yet. |
| P https://support.google.com/a/answer/81126?hl=en | no date | Gmail sender guidelines: SPF or DKIM for everyone; SPF, DKIM and DMARC (may be `p=none`) for bulk senders; DKIM 1024 minimum, 2048 recommended. Unchanged since 1.0. |
| P https://support.google.com/a/answer/14229414?hl=en | no date | Gmail FAQ: enforcement ramping up since November 2025. No new rule dated 2026 found. |
| P https://senders.yahooinc.com/best-practices/ | no date | Same requirements as Gmail. |
| P https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730 | 2025-04-02, updated 2025-04-30 | Outlook.com: SPF, DKIM and DMARC for senders of more than 5,000 a day. |
| P [lead] https://www.microsoft.com/en-us/security/blog/2026/01/06/phishing-actors-exploit-complex-routing-and-misconfigurations-to-spoof-domains/ | 2026-01-06 | Spoofing of an organisation's own domain where DMARC is not enforced and SPF is soft; recommends DMARC reject. Context for why `p=reject` matters; no rule taken from it. |
| P https://knowledge.workspace.google.com/admin/security/set-up-bimi?hl=en | no date | BIMI in Gmail needs DMARC at quarantine or reject and a VMC or CMC. Considered for 1.1 and left out (see shortlist). |
| S https://bimigroup.org/implementation-guide/ | no date | BIMI implementation guide. |

## 2. Domains that send no mail

| Source | Date of source | Takeaway |
|---|---|---|
| P [lead] https://www.m3aawg.org/sites/default/files/m3aawg_parked_domains_bcp-2022-06.pdf | updated June 2022 | Text read with `pdftotext`. Records: `example.com TXT "v=spf1 -all"` and `*.example.com TXT "v=spf1 -all"`; DMARC `v=DMARC1; p=reject` (rua optional); `example.com MX 0 .`. On DKIM: "There is no need to publish any DKIM record for a parked domain and in fact none should be published." |
| P [lead] https://www.gov.uk/guidance/protect-domains-that-dont-send-email | published 2016-10-04, updated 2021-03-01 | Records: `v=spf1 -all`; `v=DMARC1;p=reject;sp=reject;adkim=s;aspf=s;fo=1;rua=...`; an empty DKIM key `v=DKIM1; p=` on `*._domainkey`; a null MX, with the note that some DNS providers do not support it. |
| P https://en.internet.nl/article/x-xss-protection-removed-and-improvement-for-no-mx-domains/ | 2020-07-13 | Internet.nl treats domains without MX separately and recommends a null MX. |

The two guides disagree on the wildcard DKIM record. Decision: Remitente requires what both agree on and lists the wildcard records as optional, naming both positions.

## 3. What people actually get wrong (support threads and issue trackers)

These are individual cases found by search, not a measured frequency. Reddit could not be opened at all.

| Source | Date | Problem shown |
|---|---|---|
| P [lead] https://community.cloudflare.com/t/spf-permerror-unexpected-x0a-in-dns-record/981221 | 2026-11-16 | A line feed pasted after `-all`: one checker says "permerror: Junk encountered in mechanism '-all\x0a'", another shows the record as valid. → rule `spf_control_chars`. |
| P [lead] https://community.cloudflare.com/t/email-routing-rejects-subdomain-mail-with-spf-dkim-pass-and-inherited-sp-none/960691 | 2026-09-19 | A subdomain inherits `sp=none` and strict alignment and its mail fails DMARC. → the inherited-policy note. |
| P [lead] https://community.cloudflare.com/t/how-to-have-multiple-spf-policies-in-place/677548 | 2024-06-26 | Two SPF records; the guide followed had `v=spf1` twice in one record. → rule `spf_dup_version` (two records were already covered in 1.0). |
| P https://community.cloudflare.com/t/issues-with-emails-not-being-received/654069 | 2024-05-09 | A second SPF record created by an email-routing feature. |
| P https://community.cloudflare.com/t/mailerlite-authentication-is-not-working/616396 | 2024-02-16 | Two SPF records after adding a newsletter service. |
| P https://community.cloudflare.com/t/unable-to-create-or-find-a-dmarc-dns-record-for-omegastone-cl/978946 | 2026-11-09 | `_dmarc` returns NXDOMAIN while the panel says the record exists. |
| P https://community.cloudflare.com/t/no-dmarc-record-and-invalid-soa-on-dalmundauto-fr/959488 | 2026-09-15 | No DMARC; a business partner rejects the mail. |
| P https://community.cloudflare.com/t/business-domain-email-not-working-for-treetrimmingwimadison-com/972751 | 2026-10-25 | A small business with no mail records at all. |
| P https://community.cloudflare.com/t/no-emails-being-received-with-new-domain-mail-address-on-outlook/976105 | 2026-11-02 | No MX, SPF, DMARC or DKIM. |
| P https://community.cloudflare.com/t/dmarc-records-are-overwritten-during-dns-onboarding-merge-no-selective-merge-unl/972487 | 2026-10-24 | An automatic DNS merge overwrote the existing `rua`. |
| P [lead] https://serverfault.com/questions/1172428/difficulty-with-dns-records-specifically-related-to-sending-email | 2025-02-07 | DMARC published on the bare domain instead of `_dmarc`. → rule `dmarc_wrong_name`. (Read through the Stack Exchange API.) |
| P [lead] https://serverfault.com/questions/1180036/how-do-i-prevent-this-message-be-careful-with-this-message-the-sender-hasnt | 2025-04-26 | `include websitewelcome.com` written with a space. → rule `spf_include_empty`. |
| P https://serverfault.com/questions/1198526/why-does-dmarc-report-spf-failures-when-spf-appears-to-pass | 2026-03-19 | An obsolete SPF type 99 record with different content from the TXT. Not added (see shortlist). |
| P https://serverfault.com/questions/1179681/spf-dmarc-dkim-records-for-internationalized-domain-name-ovh | 2025-04-23 | Checkers fail on an internationalised domain name. Not addressed in 1.1. |
| P https://learn.microsoft.com/en-us/answers/questions/5488542/trouble-syncing-the-dkim | 2025-07-22 | Microsoft 365 shows "CnameMissing" although the DKIM CNAMEs resolve: DNS cannot tell whether signing is enabled. Reason why no "DKIM not activated" rule was added. |
| P https://learn.microsoft.com/en-us/answers/questions/6063865/550-5-7-1-message-rejected-message-lacks-spf-dkim | 2026-11-06 | Outlook.com bounces "lacks SPF/DKIM/DMARC"; users fixed it by publishing `_dmarc`. |
| P https://learn.microsoft.com/en-us/answers/questions/6063210/spf-validation-error | 2026-11-06 | Same bounce; a reply in the thread attributes it to a rule change that was rolled back (not confirmed outside the thread). |
| P https://community.klaviyo.com/accounts-and-settings-2/demarc-help-urgent-11434 | 2024-04-10 | Three `_dmarc` records. |
| P https://community.shopify.com/t/problems-authenticating-sender-email-domain-in-shopify-with-mailerlite/303002 | 2024-03-06 | "SPF has more than one record". |
| P https://community.shopify.com/t/is-dmarc-record-really-as-simple-as-it-sounds/279516 | 2023-12-22 | A DMARC record that checkers cannot find; warning about the host field of the DNS panel. → the doubled-name check (`_dmarc.domain.domain`). |
| P [lead] https://github.com/domainaware/checkdmarc/issues/209 | 2025-11-28 | `ip4:45.154.45.81~all` without a space was accepted as valid. → rule `spf_glued`. (Read through the GitHub API.) |
| P [lead] https://github.com/domainaware/checkdmarc/issues/213 | 2025-12-04 | Empty `include`, double `redirect` and a duplicated `p` tag were not detected. → rules `spf_include_empty`, `dmarc_dup_tag`. |
| P [lead] https://github.com/domainaware/checkdmarc/issues/276 | 2026-09-11 | Request to detect a TXT next to a CNAME at `_dmarc`. Not added. |
| P https://github.com/domainaware/checkdmarc/issues/200 · https://github.com/domainaware/checkdmarc/issues/204 · https://github.com/domainaware/checkdmarc/issues/281 | 2025-10-29 · 2025-11-24 · 2026-09-20 | False alarms about TXT strings over 255 characters on records that were split correctly. Reason why that check was left out. |

## 4. What other tools do

| Source | Date of source | Takeaway |
|---|---|---|
| P [lead] https://github.com/domainaware/checkdmarc/blob/master/CHANGELOG.md | no dates in file | 6.0.0: the tree walk "now applies RFC 9989 §4.10.2 Organizational Domain selection ... instead of stopping at the closest parent record, which selected the opposite policy in the RFC's own worked example"; null MX next to other MX "flagged as an RFC 7505 §3 violation"; `10 .` warned as malformed. 5.16.0: DMARCbis references renamed to RFC 9989. Remitente 1.0 had the same "closest parent" shortcut. |
| P https://pypi.org/project/checkdmarc/#history | 6.0.4 on 2026-10-13; 6.0.0 on 2026-08-31; 5.16.0 on 2026-05-20 | Release dates. A Python command-line tool: needs an install. |
| P https://domainaware.github.io/checkdmarc/ | no date | Feature list of 6.0.4: DNSSEC chain, DANE, null MX, parked-domain MX warning, BIMI, MTA-STS, TLS-RPT. |
| P https://internet.nl/test-mail/ | no date | Mail test with IPv6, DNSSEC, DMARC/DKIM/SPF, STARTTLS and DANE, RPKI. English and Dutch. |
| S https://www.sidn.nl/en/news-and-blogs/dmarc-is-now-a-formal-internet-standard-for-e-mail-security | 2026-06-10 | Says Internet.nl did not yet support all of RFC 9989 at that date. |
| P https://www.hardenize.com/report/example.com | no date | Public report without an account; server-side. |
| P https://dmarcian.com/dmarc-inspector/ | no date | Still lists `rf`, `pct`, `ri`. English, French, Japanese. |
| P https://dmarcian.com/dmarc-rfc-updates/ | 2026-07-02, updated 2026-08-14 | Summary of RFC 9989. |
| P https://mxtoolbox.com/c/products/mxtoolboxpricing | no date | Free tier with one domain; paid plans. |
| P https://easydmarc.com/tools/domain-scanner | no date | Asks for a name and work email for the full report. |
| P https://toolbox.googleapps.com/apps/checkmx/ | no date | Has Spanish, but covers only MX, SPF and one DKIM selector. |
| P https://www.learndmarc.com/ · https://www.mail-tester.com/faq | no date | Both require sending them an email. |
| S https://archive.fosdem.org/2026/schedule/event/H9GEBT-fos-check-tooling-for-mail-config/ | 2026-01-31 | A talk asking for free alternatives for checking mail configuration. |

Could not be opened: Reddit (every subreddit tried), the Cloudflare page on domains without email (403), NCSC (404), Microsoft Remote Connectivity Analyzer (script-only page), the Internet.nl repository pages (404).

## JUDGE — shortlist for 1.1

Scores 1–5: usefulness to a small business × freshness × feasibility in one run × shareability.

| Candidate | Use | Fresh | Feasible | Share | Total | Decision |
|---|---|---|---|---|---|---|
| A. RFC 9989 Tree Walk for subdomains, with the policy that really applies | 4 | 5 | 5 | 3 | 300 | **Done.** It was a bug in 1.0 (the README admitted it), and checkdmarc fixed the same shortcut in August 2026. |
| B. "Domain that sends no mail" checklist | 5 | 3 | 5 | 5 | 375 | **Done.** No thread asked for it (owners do not know they need it), but two public guides and RFC 7505 back it, and no simple browser tool explains why `-all` alone is not enough. |
| C. DMARC at the wrong name, and copy-paste damage in SPF/DMARC | 5 | 4 | 5 | 3 | 300 | **Done.** The most repeated real cases after "two SPF records", which 1.0 already handled. |
| D. Null MX mixed with real MX | 2 | 3 | 5 | 2 | 60 | **Done** (three lines once B existed). |
| E. BIMI readiness | 2 | 3 | 4 | 4 | 96 | Not done: needs a paid certificate to matter in Gmail; few small businesses are there. |
| F. DNSSEC / DANE status | 2 | 3 | 2 | 2 | 24 | Not done: over DNS-over-HTTPS the tool would only repeat the resolver's verdict, and Candado (experiment 102) already covers DNSSEC. |
| G. TXT strings over 255 bytes, TXT next to CNAME, SPF type 99 | 2 | 3 | 2 | 1 | 12 | Not done: one case each at most, and the 255-byte check caused four false-alarm issues in checkdmarc. |
| H. "Microsoft 365 DKIM not activated" | 3 | 4 | 1 | 3 | 36 | Not done: the real cases show DNS cannot tell. |

Checked and rejected along the way: flagging `~all` as a problem. Microsoft's January 2026 post recommends hard fail, while RFC 9989 notes that `-all` can cause rejection before DMARC is evaluated; the tool keeps treating both as valid, and recommends `-all` only for domains that send nothing (RFC 7505, M3AAWG, GOV.UK).

No live domain was queried to build or test this release: all 32 tests and the headless check of the browser demo ran against local fixtures (the demo's DNS-over-HTTPS requests were intercepted and answered locally).
