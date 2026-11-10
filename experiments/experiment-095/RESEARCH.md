# Research log, Experiment 095 (2026-11-10)

**Gate result: FAIL for new-tool research. Shipped as `maintenance (research blocked)` per ROUTINE.md "No-research fallback (a)".**

Today's lane was Tuesday, ISO week 46 (even), so Shopify. Three scouts were launched in parallel. In this cloud session every `WebFetch` and `curl` to the public web failed (`getaddrinfo ENOTFOUND` for shopify.dev, help.shopify.com, community.shopify.com, sansec.io and others; `api.github.com/advisories` returned 403). `WebSearch` worked, so only search-result snippets were seen. **0 pages were fetched in this run**, so the "6 fetched links, 3 primary" gate cannot be met and no new tool was built from unverified snippets.

## Leads seen only as search snippets (unverified, accessed 2026-11-10, no page opened)
| Lead | URL | Date | Takeaway (snippet level) |
|---|---|---|---|
| Checkout script sunset | https://shopify.dev/docs/storefronts/themes/architecture/layouts/checkout-liquid | no date | Snippet says legacy script tags / Additional Scripts on order status pages were sunset (Plus 2025-08-28, non-Plus 2026-08-26). Needs confirmation. |
| Injection via collaborator account | https://community.shopify.com/t/urgent-shopify-flagged-malicious-code-injected-via-collaborator-account-need-help-understanding-root-cause/622122 | no date | Merchant reports malicious code in theme.liquid injected through a collaborator account. |
| Typosquat CDN in theme | https://community.shopify.com/t/urgent-need-help-removing-malicious-code-injections-jsdeliver-cloud-brandagents-js-from-shrine-theme/600137 | no date | Fake "jsdeliver.cloud" script in a theme. |
| Unknown script, unknown source | https://community.shopify.com/t/what-app-could-be-injecting-this-unknown-script/306630 | no date | Merchants cannot attribute scripts to apps. |
| Existing paid apps | https://apps.shopify.com/shieldscan | no date | Installed scanner app, freemium; needs store access. |
| Theme Check | https://shopify.dev/docs/storefronts/themes/tools/theme-check/checks/remote-asset | no date | Flags remote assets as a performance warning, not a security check. |

## JUDGE (shortlist for a future run when the network allows; usefulness x freshness x feasibility x shareability, 1-5 each)
1. Storefront/theme script inventory + suspicious-pattern linter on pasted HTML/Liquid (typosquat CDNs, eval/atob, orphaned includes, CSV for a PCI 6.4.3-style inventory): 5x3x4x5 = best candidate. Gap seen: no free, offline, paste-in tool surfaced in snippets.
2. Staff/collaborator/app-scope hygiene checker on a pasted list: 4x3x5x4.
3. Merchant phishing-message triage (fake collaborator requests, Shop-app invoice scams): 4x3x4x4.

Nothing here is a confirmed fact; verify before building.

## What was built instead
Gatehouse 1.2: browser demo and pure API for an existing, already-researched tool (Experiments 087/088). No claim in it depends on today's facts.
