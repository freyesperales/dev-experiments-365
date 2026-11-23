# Research — Experiment 107 (Monday lane: email authentication)

Run date: 2026-11-23 (UTC). Three scouts researched in parallel (what is rising, real small-business pain, existing tools). Then the lead agent downloaded the sources the tool depends on and read the relevant passage in each. Every source below was opened during this run. "Lead" means the lead agent fetched it (HTTP 200) and read the quoted fact in the downloaded page; "scout" means one scout opened it and the lead did not repeat it. Items nobody could open are listed at the end and are not used.

## Sources

| # | Source | Source date | Accessed | Type | Takeaway |
|---|---|---|---|---|---|
| 1 | [RFC 9990 — DMARC Aggregate Reporting](https://www.rfc-editor.org/rfc/rfc9990.txt) | May 2026 | 2026-11-23 (lead) | primary (spec) | Obsoletes RFC 7489. Appendix A: schema with target namespace `urn:ietf:params:xml:ns:dmarc-2.0`; `policy_published` has `np`, `testing` (n/y), `discovery_method` (psl/treewalk) and no `pct`; disposition adds `pass`; override reasons are `local_policy`, `mailing_list`, `other`, `policy_test_mode`, `trusted_forwarder`; `envelope_from` and `envelope_to` optional; DKIM `selector` required; at most one `spf` result. Appendix B: the sample report used as a test fixture. Section 3.5.2 (file name `receiver!policy-domain!begin!end[!unique-id].xml` or `.xml.gz`, GZIP SHOULD, media type `application/gzip`). Section 8.1: "the archive decompressor and XML parser are at risk to resource exhaustion attacks (zip bomb or XML bomb)". |
| 2 | [RFC 9989 — DMARC](https://www.rfc-editor.org/rfc/rfc9989.txt) | May 2026 | 2026-11-23 (lead) | primary (spec) | Appendix A.6, removal of `pct`: the `t` tag has the values `y` and `n`, "analogous … to the pct tag values 0 and 100". |
| 3 | [RFC 7489 — DMARC (2015)](https://www.rfc-editor.org/rfc/rfc7489.txt) | March 2015 | 2026-11-23 (lead) | primary (spec) | Appendix C: target namespace `http://dmarc.org/dmarc-xml/0.1`, `pct` in `policy_published`, override reasons `forwarded`, `sampled_out`, `trusted_forwarder`, `mailing_list`, `local_policy`, `other`. Still the format most reports use. |
| 4 | [RFC 9991 — DMARC Failure Reporting](https://www.rfc-editor.org/rfc/rfc9991.html) | May 2026 | 2026-11-23 (scout) | primary (spec) | Failure reports are a separate document; out of scope for this tool. |
| 5 | [RFC 8460 — SMTP TLS Reporting](https://www.rfc-editor.org/rfc/rfc8460.html) | September 2018 (per scout) | 2026-11-23 (scout) | primary (spec) | JSON with `organization-name`, `date-range`, `policies`. Used only to recognise a TLS report and say it is not a DMARC report. |
| 6 | [dmarc.org — IETF publishes updated DMARC specification](https://dmarc.org/2026/05/ietf-publishes-updated-dmarc-specification/) | 2026-05-20 | 2026-11-23 (lead) | secondary (dmarc.org) | "RFC 9989 describes the core protocol, RFC 9990 covers aggregate reporting, RFC 9991 details failure reporting". |
| 7 | [Microsoft Learn — Set up DMARC](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-dmarc-configure) | 2026-07-03, updated 2026-07-17 (per scout) | 2026-11-23 (lead) | primary (vendor docs) | The report is "an XML email attachment that's likely GZIP compressed. The XML schema is defined in Appendix C of RFC 7489". Microsoft 365 sends aggregate reports only when the MX points directly to Microsoft 365. |
| 8 | [Google Workspace — About DMARC reports](https://knowledge.workspace.google.com/admin/security/about-dmarc-reports?hl=en) | no date | 2026-11-23 (lead fetched, fact read by scout) | primary (vendor docs) | Google's example report has no namespace, no `version`, no `envelope_from`, no `selector`, and has `pct`. |
| 9 | [Google — Email sender guidelines FAQ](https://support.google.com/a/answer/14229414?hl=en) | no date | 2026-11-23 (scout) | primary (vendor docs) | Enforcement timeline and the 4.7.x / 5.7.x codes for unauthenticated mail. Context, not used in the tool. |
| 10 | [Microsoft Support — Fix NDR error 550 5.7.515](https://support.microsoft.com/en-us/outlook/fix-ndr-error-550-5-7-515-in-outlook-com) | no date | 2026-11-23 (scout) | primary (vendor docs) | Outlook.com rejects mail from high-volume domains that do not meet the authentication level. Context for why small businesses end up publishing DMARC. |
| 11 | [dmarcian — Outlook.com incident, November 2026](https://dmarcian.com/?p=23240) | 2026-11-09, updated 2026-11-13 | 2026-11-23 (scout) | secondary (vendor blog) | From 6 to 9 November 2026 Outlook.com rejected mail from domains without DMARC; attributed to a faulty rule and reverted. Not confirmed by a public Microsoft page. |
| 12 | [IETF datatracker — DKIM2 draft](https://datatracker.ietf.org/doc/draft-ietf-dkim-dkim2-spec/) | 2026-11-01 | 2026-11-23 (scout) | primary (draft) | Still a working-group draft. Not used. |
| 13 | [Stalwart forum — DMARC invalid report schema](https://support.stalw.art/t/dmarc-invalid-report-schema-causing-loop/1250) | 2026-08-02 | 2026-11-23 (lead) | secondary (forum) | A new-format report was refused by a receiver's validator: `code = 555, details = "invalid_report_schema"`. |
| 14 | [DMARCguard — the aggregate report explained](https://dmarcguard.io/blog/dmarc-aggregate-report/) | 2026-08-24, updated 2026-11-04 | 2026-11-23 (scout) | secondary (vendor blog) | Per-provider quirks; says Yahoo report ids grew to more than thirty digits. Unconfirmed, but the tool keeps report ids as text. |
| 15 | [Shopify Community — "Report domain" email every day](https://community.shopify.com/t/report-domain-google-email-jeden-tag/311049) | 2024-04-03 | 2026-11-23 (lead) | forum | A merchant receives a daily mail titled "Report domain: … Submitter: google.com Report-ID: …" and asks what it is (German). |
| 16 | [Shopify Community — daily DMARC emails from Google](https://community.shopify.com/t/jeden-tag-dmarc-emails-von-google/325586) | 2024-05-23 | 2026-11-23 (scout) | forum | The same user asks how to switch the reports off and ends up changing the DMARC record to stop them. |
| 17 | [Hacker News comment](https://news.ycombinator.com/item?id=46133045) | no exact date | 2026-11-23 (scout) | forum | Reports taken for malware and left unopened. |
| 18 | [Microsoft Q&A — "This is a DMARC aggregate report from Microsoft"](https://learn.microsoft.com/en-sg/answers/questions/1470050/this-is-a-dmarc-aggregate-report-from-microsoft-co) | 2023-12-28 | 2026-11-23 (lead) | forum | "I don't understand what is wanted from me, why and what I should do." Per scout: later replies read SPF "Fail" as "rejected" and get no answer. |
| 19 | [mox issue #176](https://github.com/mjl-/mox/issues/176) | 2024-06-14 | 2026-11-23 (lead) | issue tracker | A DKIM "fail" in Google's reports was an ed25519 signature Google does not evaluate, next to an RSA one that passes. Per scout: the maintainer explains that the published policy is what was asked, not what happened. |
| 20 | [Shopify Community — emails going to spam (SendGrid)](https://community.shopify.com/t/emails-going-to-spam-spf-dkim-and-dmarc-authentication-issues-with-shopify-sendgrid/397564) | 2025-02-27 | 2026-11-23 (scout) | forum | Newsletters in spam, DKIM signed by sendgrid.info, no answers. The "service sends for you without your domain" case. |
| 21 | [SmarterTools community — Google Calendar invite violates DMARC](https://portal.smartertools.com/community/a86796/google-calendar-invite-violates-dmarc___.aspx) | 2015-08-17 | 2026-11-23 (scout) | forum | SPF and DKIM pass for google.com, not for the organiser's domain. |
| 22 | [dmarc-report-converter issue #22](https://github.com/tierpod/dmarc-report-converter/issues/22) | 2022-02-01 | 2026-11-23 (lead) | issue tracker | "XML syntax error on line 1: illegal character code U+001F": the report was compressed with gzip twice. |
| 23 | [parsedmarc issue #429](https://github.com/domainaware/parsedmarc/issues/429) | 2023-09-01 | 2026-11-23 (lead) | issue tracker | "Invalid reports from mimecastreport.com due to trailing \r\n on gzip data". |
| 24 | [parsedmarc issue #409](https://github.com/domainaware/parsedmarc/issues/409) | 2023-05-09 | 2026-11-23 (lead) | issue tracker | Attachments from Yahoo where "the XML file contents are literally `unused`". |
| 25 | [mailop list — report attachments](https://mail-archive.com/mailop@mailop.org/msg22660.html) | 2024-07-27 | 2026-11-23 (lead) | mailing list | "zip files declared as application/gzip, and gzip files declared as application/zip". Hence detection by first bytes. |
| 26 | [dmarcian forum — invalid xml file](https://forum.dmarcian.com/t/invalid-xml-file-in-xml-to-human-converter/2468) | 2024-05-23 | 2026-11-23 (scout) | forum | A provider's report with SPF "pass" and an empty domain was refused as invalid XML by a reader. |
| 27 | [parsedmarc](https://github.com/domainaware/parsedmarc) | v11.3.0 2026-11-11, commit 2026-11-16 (per scout) | 2026-11-23 (lead) | repo | "the legacy draft and 1.0 schemas (RFC 7489) and the new RFC 9990 schema". Python 3.11+; dashboards need Elasticsearch or OpenSearch. Output is JSON/CSV, not explanations. |
| 28 | [dmarc-srg](https://github.com/liuch/dmarc-srg) | v2.3 2025-03-19, commit 2026-10-08 | 2026-11-23 (scout) | repo | Needs PHP 8.1+ and MariaDB/MySQL. |
| 29 | [dmarc-report-converter](https://github.com/tierpod/dmarc-report-converter) | v0.8.1 2024-06-17 | 2026-11-23 (scout) | repo | Go binary, static HTML; no commits since. |
| 30 | [dmarc-visualizer](https://github.com/debricked/dmarc-visualizer) | last commit 2023-11-13 | 2026-11-23 (scout) | repo | Docker, Elasticsearch, Grafana; inactive. |
| 31 | [Open-DMARC-Analyzer](https://github.com/userjack6880/Open-DMARC-Analyzer) | last commit 2023-06-08 | 2026-11-23 (scout) | repo | PHP; inactive. |
| 32 | [dmarcts-report-viewer](https://github.com/techsneeze/dmarcts-report-viewer) | last commit 2023-07-15 | 2026-11-23 (scout) | repo | PHP; inactive. |
| 33 | [dmarcreport.com — analizador (es)](https://dmarcreport.com/es/tools/dmarc-report-analyzer/) | no date | 2026-11-23 (lead) | vendor page | In Spanish; says the file is processed in the browser and nothing is uploaded. Per scout: accepts .xml and .xml.gz, not .zip; shows results, partial guidance. |
| 34 | [CaptainDNS — lector de informes DMARC (es)](https://www.captaindns.com/es/tools/email-authentication/dmarc-report-reader) | no date | 2026-11-23 (lead) | vendor page | In Spanish; accepts .xml, .xml.gz and .zip up to 10 MB; mentions RFC 9989/9990/9991. Does not say where the file is processed. |
| 35 | [Bird — DMARC report analyzer](https://bird.com/tools/dmarc-report-analyzer) | no date | 2026-11-23 (scout) | vendor page | No account; says it runs locally; summary without steps. |
| 36 | [MXToolbox — DMARC report analyzer](https://mxtoolbox.com/DmarcReportAnalyzer.aspx) | no date | 2026-11-23 (scout) | vendor page | The report is uploaded; English; table per IP. |
| 37 | [EasyDMARC — aggregate reports tool](https://easydmarc.com/tools/dmarc-aggregated-reports) and [pricing](https://easydmarc.com/pricing) | no date | 2026-11-23 (scout) | vendor pages | The report is uploaded; monitoring means redirecting `rua` to them; paid plans from 35.99 EUR a month billed yearly, as seen today. |
| 38 | [Postmark DMARC](https://dmarc.postmarkapp.com/) | no date | 2026-11-23 (scout) | vendor page | Free weekly digest by redirecting `rua`; English. |
| 39 | [URIports pricing](https://www.uriports.com/pricing) | no date | 2026-11-23 (scout) | vendor page | No free plan; `rua` redirected. |
| 40 | [Cloudflare DMARC Management](https://developers.cloudflare.com/dmarc-management/enable/) | no date | 2026-11-23 (scout) | vendor docs | Needs the domain's DNS on Cloudflare; adds its own `rua`. |
| 41 | [Valimail pricing](https://www.valimail.com/pricing/) and [Red Sift pricing](https://redsift.com/pricing) | no date | 2026-11-23 (scout) | vendor pages | Account required and `rua` redirected in both. |

41 rows, 43 distinct links. Primary sources (spec, vendor docs, issue tracker): rows 1–5, 7–10, 12, 19, 22–24. Rows where the lead agent read the fact itself: 1, 2, 3, 6, 7, 13, 15, 18, 19, 22, 23, 24, 25, 27, 33, 34.

## What the scouts found

**Rising.** DMARCbis became a standard in May 2026 as three documents. The aggregate report changed namespace and lost `pct`, while the largest senders of reports still document the 2015 format, so a reader has to take both. Outlook.com had a rejection incident for domains without DMARC on 6–9 November 2026 (vendor-reported).

**Pain.** The best documented pain is not configuring DMARC. It is receiving the reports and not knowing what they are, whether they are a scam, or what to do about them. The usual answer in forums is "ignore it or remove the rua address". People read "fail" as "rejected" and mix up the published policy with what the receiver did. Files that will not open (gzip twice, trailing bytes, wrong media type, placeholder attachments) come up in the issue trackers of the open-source readers.

**Existing tools.** Hosted services want an account and the `rua` redirected to them, so the data leaves and most small businesses never sign up. The free one-off viewers show a table per IP. The open-source readers that are still maintained need Python plus a search cluster, or PHP plus a database. One Spanish page says it works in the browser (row 33) and one Spanish page reads zip and mentions the new RFCs (row 34); neither was seen to take a month of files at once and answer "can I move to quarantine or reject".

## JUDGE

Score = usefulness to a small business × freshness × feasibility in one run × shareability (1–5 each).

| Candidate | Useful | Fresh | Feasible | Shareable | Score | Decision |
|---|---|---|---|---|---|---|
| **Local reader for batches of DMARC aggregate reports, with a verdict** (both formats; any archive shape; grouped by sender; "can I tighten the policy?") | 5 | 4 | 4 | 5 | 400 | **Chosen** |
| Translator for authentication bounces (Gmail 4.7.x/5.7.x, Outlook 550 5.7.515, the November incident code) | 4 | 5 | 4 | 3 | 240 | Not today: the freshest code comes from a single vendor blog, not from a public Microsoft page. |
| Local reader for pasted `Authentication-Results` / ARC headers, in Spanish | 4 | 3 | 4 | 4 | 192 | Good candidate for another Monday. No forum evidence of demand was found today. |
| Local TLS-RPT (RFC 8460) reader in Spanish with `.json.gz` | 2 | 2 | 5 | 3 | 60 | Few small businesses publish MTA-STS or TLS-RPT. Possible Sunday addition to this tool. |

The Monday theme was kept. The previous two email entries (100 and 106, Remitente) check what a domain publishes in DNS; this one reads what receivers report back, which nothing in the repository did.

## Design decisions that come from the research

- Format is detected by magic bytes, never by name or media type (rows 22, 23, 25).
- gzip inside gzip, bytes after the gzip stream and the word "unused" are handled and explained (rows 22, 23, 24).
- Both namespaces and no namespace are accepted; `pct`, `np`, `testing`, `discovery_method`, disposition `pass` and `policy_test_mode` are understood (rows 1, 3, 7, 8, 13).
- `testing=y` and `pct=0` both mean "the policy is not applied"; the advice for a trial run is `t=y`, not `pct` (row 2).
- The decompressor has an output limit and the XML reader never expands entities declared in a DOCTYPE (row 1, section 8.1).
- Report ids are kept as text (row 14).
- The output says in words that "fail" is not "rejected" and that the published policy is a request (rows 18, 19).
- The page opens with the answer to "is this a scam?" (rows 15, 16, 17).

## Not from the sources

- The list that gives a friendly name to sending services (for example `sendgrid.net` → SendGrid, `gappssmtp.com` → Google Workspace default signing) and the click paths to turn on DKIM in Google Workspace and Microsoft 365 were written by the lead agent and were not checked against each provider's documentation in this run. The README says so under Limitations.
- The 30 days asked before "ready" are this tool's rule of thumb. The scouts only found vendor guides for that figure (30 to 60 days), no forum thread or spec.

## Could not be opened or verified (not used)

- Reddit and Server Fault: no thread could be opened by the scouts.
- community.cloudflare.com/t/dmarc-aggregate-report/393229 and issues.ecosyste.ms returned 403.
- PowerDMARC's site returned 403; dmarcian's XML-to-human converter page showed no content.
- BIMI (whether Apple Mail accepts CMC): search results contradict each other; no primary source opened.
- "Google and Yahoo send .zip": only seen in vendor blogs, no real sample. The tool reads zip anyway.
- mailheader.org redirects to an unrelated domain; not followed and not recommended.
