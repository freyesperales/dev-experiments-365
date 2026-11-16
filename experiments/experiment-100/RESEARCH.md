# Research — Experiment 100 (Monday: email authentication)

Date of run: 2026-11-16 (first Monday run with live web access; the 2026-11-09 Monday run was blocked).
Method: three parallel scouts (what is changing, real defender pain, what already exists) with live web search and fetch,
then key facts re-checked by the main agent: the RFC 9989 text was downloaded and read (tag lists in C.5.1/C.5.2,
`t` and `np` definitions, Appendix A.6); RFC 7208 4.6.4 and RFC 8461 `max_age` were grepped from the RFC text;
Google's 1024-bit DKIM requirement was read from the live help page; every URL below was re-requested at the end of
the run (HTTP 200 for all except dmarcian, which returns 403 to scripted requests; a scout read it with a browser fetch).

## Sources fetched in this run (accessed 2026-11-16)

### What is changing (primary sources)
| # | Type | URL | Source date | Takeaway |
|---|------|-----|-------------|----------|
| 1 | primary (standard) | https://www.rfc-editor.org/info/rfc9989 (full text read: /rfc/rfc9989.txt) | May 2026 | DMARCbis is now RFC 9989, obsoleting RFC 7489 and 9091. Adds `np`, `psd`, `t`; removes `pct`, `rf`, `ri`. `t=y` asks receivers to apply one level below the policy; it is the replacement for `pct=0`. A record without `p` is treated as `p=none`. |
| 2 | primary (standard) | https://datatracker.ietf.org/doc/draft-ietf-dmarc-dmarcbis/ | updated 2026-05-20 | Draft history; Public Suffix List replaced by a DNS tree walk; aggregate and failure reports moved to RFC 9990 and 9991. |
| 3 | primary (vendor docs) | https://support.google.com/a/answer/14229414 | no date (notice for November 2025) | Gmail is "ramping up enforcement" on non-compliant traffic from November 2025, including temporary and permanent rejections. |
| 4 | primary (vendor docs) | https://support.google.com/a/answer/81126 | no date | All senders: SPF or DKIM, valid PTR, TLS, spam rate under 0.3%. Over 5,000/day: SPF, DKIM and DMARC (p=none is enough), From alignment, one-click unsubscribe. "Sending to personal Gmail accounts requires a DKIM key of 1024 bits or longer"; 2048 recommended. |
| 5 | primary (vendor blog) | https://techcommunity.microsoft.com/blog/microsoftdefenderforoffice365blog/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730 | 2025-04-02 (updated end of April 2025) | Outlook consumer domains: over 5,000/day need SPF, DKIM and DMARC p=none or stronger; from 2025-05-05 non-compliant mail goes to Junk, rejection (550 5.7.515) to follow. |
| 6 | primary (vendor docs) | https://senders.yahooinc.com/best-practices/ | no date | Yahoo bulk senders: SPF and DKIM, DMARC at least p=none, rua strongly recommended, RFC 8058 one-click unsubscribe. |
| 7 | primary (standard) | https://www.rfc-editor.org/rfc/rfc7208 | April 2014 | 4.6.4: max 10 DNS-querying terms (include, a, mx, ptr, exists, redirect), otherwise permerror; void lookups SHOULD be limited to two; an `mx` may not return more than 10 hosts. |
| 8 | primary (standard) | https://www.rfc-editor.org/rfc/rfc8461 | September 2018 | MTA-STS: TXT `_mta-sts` with `v=STSv1; id=`; policy at `https://mta-sts.<domain>/.well-known/mta-sts.txt` with `version`, `mode` (enforce/testing/none), `mx`, `max_age` (max 31557600). |
| 9 | primary (standard) | https://www.rfc-editor.org/rfc/rfc8460 | September 2018 | TLS-RPT: TXT `_smtp._tls` with `v=TLSRPTv1; rua=` (mailto: or https:). |

### Real defender pain
| # | Type | URL | Source date | Takeaway |
|---|------|-----|-------------|----------|
| 10 | forum | https://techcommunity.microsoft.com/discussions/exchange_general/record-contains-too-many-lookups-spf-records/417193 | 2019-04-09 | Admin with several SaaS senders always exceeds the 10-lookup limit; advised to flatten or use a subdomain, and objects that flattened IPs break when providers change them. |
| 11 | vendor engineer blog (archived) | https://learn.microsoft.com/en-us/archive/blogs/tzink/common-errors-in-spf-records | 2016-02-19 | Most common SPF errors seen at Office 365: too many lookups, two SPF records, `ip:` instead of `ip4:`, bad quote concatenation, `+all`. |
| 12 | Q&A (primary vendor forum) | https://learn.microsoft.com/en-us/answers/questions/5520068/can-we-deploy-multiple-dkim-on-each-domain | 2025-08-11 | Small business with Exchange Online plus Zoho CRM asks whether to add a second SPF record; answer: merge into one and watch the limit of 10. |
| 13 | issue tracker | https://github.com/cisagov/trustymail/issues/21 | 2017-11-13 (open) | "Too many DNS lookups" even on a US government domain (own includes plus G Suite). |
| 14 | community | https://help.zoho.com/portal/fr/community/topic/dkim-selector-where-to-find-it | no date | Zoho Mail + Shopify user cannot find their DKIM selector; no answer. Basis for the "paste a DKIM-Signature" option. |
| 15 | blog (author runs a checker; interested party) | https://dev.to/vadimivanov/how-to-read-a-dmarc-aggregate-report-without-losing-your-mind-1b14 | 1 August, year not shown | Raw DMARC XML reports are hard to read by hand. Not addressed in this tool (candidate for a later experiment). |

### What already exists and why it falls short
| # | Type | URL | Source date | Takeaway |
|---|------|-----|-------------|----------|
| 16 | open source | https://github.com/domainaware/checkdmarc | release 6.0.4, 2026-10-13 | Checks SPF/DMARC well, but it is a Python CLI in English. |
| 17 | open source | https://github.com/domainaware/parsedmarc | release 11.3.0, 2026-11-11 | DMARC report parser; Python, English, needs setup. |
| 18 | open source | https://github.com/spf-tools/spf-tools | last push 2026-04-13 | SPF flattening shell scripts; needs a Unix terminal. |
| 19 | commercial | https://dmarcian.com/pricing/ | no date | Free plan is non-commercial only (business domains not allowed); Basic is USD 24/month. |
| 20 | commercial | https://mxtoolbox.com/c/products/pricing | no date | Free plan: 1 domain, no DMARC reports; SPF flattening only on a USD 399/month plan. |
| 21 | free tool | https://toolbox.googleapps.com/apps/checkmx/ | no date | Checks MX and SPF, available in Spanish; no DMARC tag analysis, no MTA-STS. |
| 22 | free tool | https://dnsrobot.net/es/spf-checker | no date | Spanish, counts SPF lookups recursively, but processes on its server and covers SPF only. |
| 23 | open source | https://github.com/novuwebsolutions/email-domain-check | last push 2026-11-09 | Closest idea (DoH, recursive SPF, MTA-STS), Estonian/English only, unclear whether it runs fully in the browser. |

Unverified leads (search snippets only, not used for any rule): a Server Fault thread on Office 365 + Google + Mailchimp exceeding 10 lookups; an r/sysadmin thread (2025-03-28) on manual DMARC work; a vendor claim that "more than half" of DMARC domains stay at p=none.

## Shortlist and judge (1-5 each: usefulness to a small business × freshness × feasibility in one run × shareability)

| Candidate | Use | Fresh | Feasible | Share | Total |
|---|---|---|---|---|---|
| **A. Browser checker over DoH: recursive SPF lookup count + DMARC under RFC 9989 + DKIM key size + MTA-STS/TLS-RPT, fixes in EN/ES** | 5 | 5 (RFC 9989 is six months old; tools still recommend `pct`) | 4 | 5 (a link with `?d=domain`) | **19** |
| B. Offline DMARC aggregate-report viewer (drop XML/GZ/ZIP) | 4 | 2 | 4 | 3 | 13 |
| C. SPF merge/flatten helper from pasted records only | 4 | 2 | 5 | 3 | 14 |

**Winner: A ("Remitente").** It covers the three most repeated pains (lookup limit, duplicate records, unknown DKIM selector),
it is the first checker we found that flags `pct`/`rf`/`ri` as removed by RFC 9989 and proposes `t=y`, it runs
entirely in the browser with no account, and its passive DNS checks can be reused in the Friday weekly report.
B stays on the shortlist for a future Monday.
