# Vigía

Paste your WordPress plugin list and see, in one minute, which plugins, themes and core version are vulnerable, actively exploited, closed on wordpress.org or abandoned, with what to do about each one.

En español: pega la lista de plugins de tu WordPress (desde Salud del sitio o WP-CLI) y verás qué está vulnerable, se está explotando, fue cerrado en wordpress.org o está abandonado, con el arreglo para cada caso. Sin cuenta; tus versiones no salen de tu computador.

**Live demo (runs in your browser):** https://freyesperales.github.io/dev-experiments-365/experiments/experiment-101/ — click "Load an example" to see a report.

## Sample run

Input: [`fixtures/site-health.txt`](fixtures/site-health.txt), a Site Health export of a neglected small-business site. Data: real API responses recorded on 2026-11-17 ([`fixtures/api-2026-11-17.json`](fixtures/api-2026-11-17.json)).

```text
$ node vigia.js fixtures/site-health.txt
Vigía 1.0.0 — 8 items checked   grade F (0/100)   CISA KEV 2026.11.13

WordPress core: WordPress 6.4.1  → 7.1.4
  [CRITICAL] This core version is affected by CVE-2026-119977, listed by CISA as exploited in the wild.
             Fix: Update to 7.1.4 today.
  [HIGH    ] WordPress 6.4.1 is marked "insecure" by wordpress.org. Security fixes exist that this site does not have.
             Fix: Update to 7.1.4 (or at least 6.4.14, the patched release of your branch). Dashboard → Updates → Update now. Back up first.
Plugin: contact-form-7 5.3.1  → 6.2.5  [active]
  [CRITICAL] 7 known vulnerabilities affect this version: CVE-2020-35489 (CVSS 10.0); CVE-2023-6449 (CVSS 7.2); …
             Fix: Update to 6.2.5 or later (Plugins → Update now). If you cannot update, deactivate it until you can.
Plugin: wp-file-manager 6.0  → 8.0.7  [active]
  [CRITICAL] ACTIVELY EXPLOITED: CVE-2020-25213 is in the CISA Known Exploited Vulnerabilities catalog.
             Fix: Update to 8.0.7 or later now, then look for signs of compromise: unknown administrator users,
                  unknown plugins, files in wp-content/mu-plugins.
  [HIGH    ] 10 known vulnerabilities affect this version: CVE-2020-25213 (CVSS 9.8); CVE-2023-6825 (CVSS 9.9); …
Plugin: display-widgets 2.6.2  [inactive]
  [HIGH    ] Closed on wordpress.org on 2021-01-30 for a SECURITY ISSUE. It will not receive updates.
             Fix: Replace it with a maintained plugin, then delete it (deactivating is not enough: the files stay reachable).
Theme: twentyfifteen 1.1  → 4.3  [active]
  [MEDIUM  ] 2 known vulnerabilities affect this version: CVE-2015-3429; Twenty Fifteen [twentyfifteen] <= 1.1
Theme: twentytwentyfour 1.0  → 1.6  [inactive]
  [LOW     ] Installed 1.0, latest is 1.6.
  ok      Plugin: akismet 5.7.2  [active]
Plugin: acme-booking-pro 2.3.0  [active]
  [INFO    ] Could not find "Acme Booking Pro" on wordpress.org by name.
                                                                  (exit code 1)

$ node vigia.js fixtures/clean.txt
Vigía 1.0.0 — 3 items checked   grade A (97/100)   CISA KEV 2026.11.13
Theme: twentytwentyfive 1.3  → 1.5
  [LOW     ] Installed 1.3, latest is 1.5.
  ok      WordPress core: WordPress 7.1.4
  ok      Plugin: akismet 5.7.2                                    (exit code 0)
```

(Lines shortened; the test suite runs the same input offline with `--offline fixtures/api-2026-11-17.json --now 2026-11-17`.)

## Run

```sh
node vigia.js site-health.txt                      # or: wp plugin list | node vigia.js -
node vigia.js list.txt --lang es --json --fail-on critical --kev-live
npm test                                           # 11 tests, node:test, no install step
```

Node 18+, zero dependencies. Exit codes: `0` ok, `1` findings at or above `--fail-on` (default `high`), `2` usage or network error. `--kev-live` downloads the current CISA catalog instead of the bundled snapshot.

### Where to get the list

- **Any WordPress owner:** Tools → Site Health → Info → "Copy site info to clipboard", then paste. It includes inactive plugins and themes.
- **WP-CLI:** `wp core version; wp plugin list; echo themes:; wp theme list` (table, `--format=csv` or `--format=json`).
- **By hand:** lines like `wordpress 6.8.2`, `contact-form-7 5.9.3`, `theme astra 4.6.1`.

## What it checks

- **Known vulnerabilities** for each plugin and theme version, matched locally against the [WPVulnerability](https://www.wpvulnerability.com/) open database (version ranges with `<`, `<=`, `>=`), with CVE links, CVSS severity and the version that fixes them. "No fix yet" is reported separately: the only answer is to remove the plugin.
- **Actively exploited (CISA KEV):** any matching CVE that is in the [CISA Known Exploited Vulnerabilities catalog](https://www.cisa.gov/known-exploited-vulnerabilities-catalog) becomes CRITICAL, with what to check after updating. Today that includes WordPress core CVE-2026-119977 ([added 2026-11-03](https://www.cisa.gov/news-events/alerts/2026/11/03/cisa-adds-one-known-exploited-vulnerability-catalog), fixed in [7.1.4](https://wordpress.org/news/2026/10/wordpress-7-1-4/)).
- **Closed plugins:** wordpress.org closes plugins (often for a security issue) and they stop getting updates, but WordPress keeps them installed without warning. Vigía shows the closure date and reason ([a real unanswered support question about exactly this](https://wordpress.org/support/?p=17491689)).
- **Core release status** from wordpress.org: `insecure`, `outdated` or `latest`, and the patched release of your branch if you cannot jump to the latest.
- **Abandoned plugins:** no update on wordpress.org in more than 2 years (MEDIUM) or 1 year (LOW). This threshold is our criterion.
- **Inactive plugins** are checked too: deactivated code is still on the server.
- **Premium or custom plugins** that are not on wordpress.org are still checked for known vulnerabilities by slug, and marked as such.

## Who it is for

The owner of a small business with a WordPress site, and the freelancer or agency that maintains it. No plugin to install on the site, no account, no API key, English and Spanish.

## Why it exists

- WPScan's API needs a token and its free plan is "Capped at 25 API calls per day" ([pricing](https://wpscan.com/pricing/)); Wordfence and Patchstack must be installed on the site or need an account; remote scanners such as SiteCheck say they "will not detect anything on the server-side", so they miss inactive and hidden plugins.
- OSV has a `WordPress:Plugin` ecosystem in its [schema](https://ossf.github.io/osv-schema/) but no WordPress data, so general dependency scanners return nothing for WordPress sites.
- Exploitation is happening now: a core flaw entered CISA KEV on 2026-11-03 and October brought plugin campaigns that leave [hidden administrator accounts](https://patchstack.com/articles/four-ways-back-in-the-wordpress-xss-campaign-that-hides-its-own-admin-account/).

Full sources and the candidate shortlist: [RESEARCH.md](RESEARCH.md).

## Privacy

The browser (or CLI) sends only **plugin and theme slugs and the core version** to `api.wordpress.org` and `www.wpvulnerability.net`. Your domain, your installed plugin versions and everything else in the Site Health text stay on your computer; version matching happens locally. A test enforces that no installed version appears in any request URL.

## Limitations

- A clean result means "nothing known", not "safe": it does not detect malware, a compromise in progress, weak passwords or server misconfiguration.
- Coverage depends on WPVulnerability. Premium plugins with few public reports may show no findings.
- Site Health lists plugins by **name**, not slug. Vigía matches names to wordpress.org slugs (exact name, then search, then slug guess) and says so; a rename or a same-name plugin can cause a wrong match. `wp plugin list` gives exact slugs.
- The KEV list in the browser is a snapshot (catalog 2026.11.13) because CISA's feed does not allow browser access; the CLI can use `--kev-live`.
- "Abandoned" (2 years without updates) is our heuristic, not a wordpress.org label.
- Not tested against a live site: everything runs on what you paste. Nothing is scanned.

## Files

`vigia.js` (library + CLI, also loaded by the page) · `kev-snapshot.js` (CISA KEV CVE IDs, 2026.11.13) · `index.html` (demo) · `test/vigia.test.js` · `fixtures/` (sample inputs and recorded API responses).

---

Daily Security Lab · Experiment 101 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
