# Research (Experiment 094, maintenance - research blocked)

Date: 2026-11-09 (Monday, theme: email authentication).

## What happened
Three parallel scouts were launched for email authentication. In this session WebFetch could not resolve most hosts
(datatracker.ietf.org, rfc-editor.org, dmarc.org, dmarcian.com, community.shopify.com, dev.to, mxtoolbox.com, etc.:
`getaddrinfo ENOTFOUND`, outside the allowed network domains). Only github.com and pypi.org were fetched, by one scout:

| Source | Date | Accessed | Takeaway |
|---|---|---|---|
| https://github.com/domainaware/parsedmarc | no date shown | 2026-11-09 | Python/server-oriented DMARC report parser; no plain-language single-report GUI |
| https://pypi.org/project/parsedmarc/ | 11.2.1 released 2026-11-01 | 2026-11-09 | Actively maintained, single maintainer |
| https://github.com/domainaware/checkdmarc | no date shown | 2026-11-09 | SPF/DMARC/MTA-STS validator CLI that queries live DNS |
| https://pypi.org/project/checkdmarc/ | 6.0.4 released 2026-10-13 | 2026-11-09 | Actively maintained |

That is 4 fetched links, none of them advisories/specs: the depth check (>= 6 links, >= 3 primary) FAILS.
Per ROUTINE.md "No-research fallback" no new tool was published from memory. Unverified search-snippet leads
(DMARCbis RFC 9989-9991 reportedly published 2026-05-20; SPF 10-lookup pain; MTA-STS adoption under 2%) were NOT fetched
and are NOT relied on; they are candidates for the next Monday once the network allows them.

## Judge
Fallback (a): maintenance of an existing tool that does not depend on fresh facts: Leashcheck 1.1 (browser demo, pure API,
Windows `cmd /c npx` fix found by testing a real config shape). Label: maintenance (research blocked).
