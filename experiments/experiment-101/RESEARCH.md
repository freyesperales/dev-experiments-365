# Research — Experiment 101 (Vigía)

Run date: 2026-11-17 (Tuesday, ISO week 47 → odd week → **WordPress** lane).
Method: three research scouts ran in parallel (rising risks / small-business pain / existing tools and open data), then the main agent re-opened the key sources and re-ran the API calls with `curl` before building. Every link below was opened in this run; access date for all of them is **2026-11-17**.

## Sources

### What is rising this week (primary sources marked P)

| # | Source | Source date | Takeaway |
|---|---|---|---|
| 1 | P · [CISA adds one KEV: CVE-2026-119977](https://www.cisa.gov/news-events/alerts/2026/11/03/cisa-adds-one-known-exploited-vulnerability-catalog) | 2026-11-03 | "WordPress Core Time-of-check Time-of-use (TOCTOU) Race Condition Vulnerability" added to KEV based on active exploitation (text re-read by the main agent). |
| 2 | P · [CISA KEV JSON feed](https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json) | catalogVersion 2026.11.13 | 1,781 entries; 8 mention WordPress (4 core CVEs in 2026, plus File Manager, Duplicator, Social Warfare, WP2). **No CORS header**, so a browser page cannot read it live → Vigía bundles a dated snapshot of the CVE IDs. |
| 3 | P · [WordPress 7.1.4 release](https://wordpress.org/news/2026/10/wordpress-7-1-4/) | 2026-10-28 | Security release; "A weakness in the WordPress upgrade process which can lead to remote code execution" among the fixes; recommends updating immediately. |
| 4 | P · [Patchstack: XSS campaign that hides its own admin account](https://patchstack.com/articles/four-ways-back-in-the-wordpress-xss-campaign-that-hides-its-own-admin-account/) | 2026-10-06 | Plugins exploited in the wild leave hidden admins and persistence; motivates the "look for signs of compromise" advice on KEV findings. |
| 5 | P · [TeamUpdraft security incident](https://teamupdraft.com/blog/security-incident-october-2026/) | 2026-10-19 (updated 10-29) | UpdraftCentral keys exposed; malicious plugins that hide themselves; cleanup steps. |
| 6 | [SecurityWeek on the core flaw](https://www.securityweek.com/fresh-wordpress-vulnerability-in-attackers-crosshairs/) | 2026-10-30 (upd. 11-04) | Secondary; reports attack attempts citing Wordfence. Its figure ("22 flaws") conflicts with the official release notes, so **no figure from it is used**. |

### Real defender pain

| # | Source | Source date | Takeaway |
|---|---|---|---|
| 7 | P · [wordpress.org support: "Plugin closed?"](https://wordpress.org/support/?p=17491689) | 2024-03 | A user asks whether their plugin was closed and gets no answer; the API already said `closed_date 2024-03-07, reason security-issue`. The data exists, owners do not find it. → Vigía shows closed status and reason. |
| 8 | [wordpress.org support: debug.log exposed](https://wordpress.org/support/topic/debug-log-31/) | 2025-03-19 | A security plugin does not detect an exposed debug log and says it is not planned — owners rely on tools that silently skip things. (Not addressed in this tool; noted for a later web-hygiene run.) |
| 9 | [WordPress Trac #64281 (mailing list)](https://lists.wordpress.org/pipermail/wp-trac/2025-November/553726.html) | 2025-11-20 | Closed as invalid: core does not treat usernames as private. Owners worry about the wrong things; the dominant real risk is outdated/closed plugins. |

### What exists and why it falls short

| # | Source | Source date | Takeaway |
|---|---|---|---|
| 10 | P · [WPScan pricing](https://wpscan.com/pricing/) | no date | API needs a token; free plan "Capped at 25 API calls per day"; commercial use needs a paid licence. |
| 11 | P · [Wordfence plugin page](https://wordpress.org/plugins/wordfence/) | 2026-11-10 | Must be installed on the site; free rules delayed by 30 days. |
| 12 | P · [Patchstack plugin page](https://wordpress.org/plugins/patchstack/) and [pricing](https://patchstack.com/pricing/) | 2026-11-16 / no date | Account + API key + plugin; virtual patching is paid. |
| 13 | P · [Jetpack Protect](https://wordpress.org/plugins/jetpack-protect/) | 2026-11-16 | Plugin plus site connection; uses WPScan data. |
| 14 | [Sucuri SiteCheck](https://sitecheck.sucuri.net/) | no date | Remote only, by its own description it "will not detect anything on the server-side": it cannot see inactive or hidden plugins. |
| 15 | P · [OSV schema](https://ossf.github.io/osv-schema/) and [OSV ecosystems list](https://osv-vulnerabilities.storage.googleapis.com/ecosystems.txt) | no date | The schema defines `WordPress:Plugin`, but OSV has **no WordPress data** (ecosystem absent; a query for `wp-file-manager` 6.0 returns `{}`). OSV cannot be the source. |
| 16 | P · [Wordfence Intelligence v3 feed docs](https://www.wordfence.com/help/wordfence-intelligence/v3-accessing-and-consuming-the-vulnerability-data-feed/) | no date | Without a key the endpoint returns 401 and has no CORS; a key cannot be shipped in a public browser page. Page content partly blocked by bot protection; terms not fully verified. |

### Open data actually used (verified with curl in this run)

| # | Endpoint | Result on 2026-11-17 |
|---|---|---|
| 17 | P · [api.wordpress.org plugins/info/1.2](https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request%5Bslug%5D=akismet) | 200, `Access-Control-Allow-Origin: *`; `version`, `last_updated`. Closed plugin (`display-widgets`) → 404 with `{"error":"closed","closed_date":"2021-01-30","reason":"security-issue"}`; unknown slug → 404 `{"error":"Plugin not found."}`. `query_plugins` search also has CORS. |
| 18 | P · [api.wordpress.org core/stable-check/1.0](https://api.wordpress.org/core/stable-check/1.0/) | 200, CORS `*`; every release labelled `insecure` / `outdated` / `latest` (latest = 7.1.4; patched branch releases such as 6.4.14 are `outdated`). |
| 19 | P · [WPVulnerability API](https://www.wpvulnerability.com/) (`https://www.wpvulnerability.net/plugin/<slug>/`, `/theme/`, `/core/<version>/`) | 200, CORS `*`, no key. Describes itself as "a 100% open and free API". Each vulnerability has `operator` {min/max version and operator `lt`/`le`/`ge`, `unfixed`}, sources (CVE, WPScan, Wordfence links) and CVSS. Version matching is done locally, so installed versions are never sent. |
| 20 | P · [WordPress core `class-wp-debug-data.php`](https://github.com/WordPress/wordpress-develop/blob/trunk/src/wp-admin/includes/class-wp-debug-data.php) and [`site-health-info.php`](https://github.com/WordPress/wordpress-develop/blob/trunk/src/wp-admin/site-health-info.php) | Read to get the exact "Copy site info to clipboard" format: always the English `debug` format, `### wp-plugins-active (N) ###` sections, `Plugin Name: version: X, author: Y, …`, active theme `name: Name (slug)`. Plugin names can contain `: ` (e.g. "Akismet Anti-spam: Spam Protection"), which the parser handles. |

Count: 20 numbered entries, 23 distinct URLs opened in this run; 15 primary sources.

## Judge

Scores 1–5: usefulness to a small business × freshness × feasibility in one run × shareability.

| Candidate | Use | Fresh | Feasible | Share | Total |
|---|---|---|---|---|---|
| **A. Paste-your-plugin-list checker** (Site Health / WP-CLI → known vulns + KEV + closed + abandoned + core status, browser and CLI) | 5 | 5 (core KEV of 2026-11-03, October plugin campaigns) | 5 (all data sources verified open, with CORS) | 5 (every WordPress owner can do it in 1 minute, no account) | **625** |
| B. Core-only version detector from public home-page HTML | 3 | 5 | 5 | 3 (generator tags are often removed; "can't tell" is common) | 225 |
| C. Indicators-of-compromise checklist (hidden admins, mu-plugins, known IOCs) | 4 | 5 | 3 (needs server access; IOCs change weekly) | 3 | 180 |
| D. wp-config.php linter (pasted, secrets removed) | 3 | 2 | 4 | 2 | 48 |

**Picked: A — Vigía.** It answers the question in the "Plugin closed?" thread directly, it covers inactive and premium plugins that remote scanners cannot see, it needs no account or key (unlike WPScan, Wordfence feed, Patchstack), and it keeps the owner's data on their computer: only slugs and the core version are sent.
B and C are kept for a later run (C fits a Sunday maintenance with fresh IOCs).

## What was not verified (so it is not claimed)
- Exact CVSS for CVE-2026-119977 (media and vendors disagree); Vigía only states the KEV listing and the official "insecure" label.
- Patchstack/Wordfence attack-volume figures; none are used.
- The localized Spanish label of the Site Health copy button; the UI names the menu path and quotes the English button text instead.
