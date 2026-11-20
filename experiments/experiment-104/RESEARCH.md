# Research — Experiment 104 (Friday lane: secrets in repos and supply chain)

Run date: 2026-11-20 (UTC). Three scouts researched in parallel (what is rising, real small-business pain, existing tools). Then the lead agent requested the sources the tool depends on again and read the relevant passage in each. Every source below was opened during this run. "Lead" means the lead agent fetched it (HTTP 200) and checked the quoted fact; "scout" means one scout opened it and the lead did not repeat it. Items nobody could open are listed at the end and are not used.

## Sources

| # | Source | Source date | Accessed | Type | Takeaway |
|---|---|---|---|---|---|
| 1 | [GitHub Docs — Remediating a leaked secret](https://docs.github.com/en/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/remediating-a-leaked-secret) | no date | 2026-11-20 (lead) | primary | Nine steps. Revoke is step 4, update affected services 5, check for unauthorized access 6, clean the repository 7, prevent 9. The tool's plan follows this order. |
| 2 | [GitHub Docs — Removing sensitive data from a repository](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) | no date | 2026-11-20 (lead) | primary | "As a first step you need to revoke and/or rotate that secret… that may be sufficient". After a rewrite the commits stay reachable in clones and forks, by SHA in cached views and through pull requests; Support removes cached views; collaborators "must rebase, not merge". |
| 3 | [GitHub Docs — About authentication to GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github) | no date | 2026-11-20 (lead) | primary | Token prefixes: `ghp_`, `github_pat_`, `gho_`, `ghu_`, `ghs_`, `ghr_`. |
| 4 | [GitHub Docs — Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) | no date | 2026-11-20 (lead) | primary | Where to delete a token. Linked from the plan. |
| 5 | [GitHub Docs — About push protection](https://docs.github.com/en/code-security/secret-scanning/introduction/about-push-protection) | no date | 2026-11-20 (lead) | primary | Push protection for users is enabled by default and stops pushes of secrets to public repositories; the repository-level one is disabled by default and needs Secret Protection. |
| 6 | [AWS IAM — Unique identifiers](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html) | no date | 2026-11-20 (lead) | primary | `AKIA` is an access key, `ASIA` a temporary (STS) access key. |
| 7 | [AWS — AWSCompromisedKeyQuarantineV3](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSCompromisedKeyQuarantineV3.html) | edited 2026-11-09 (per scout) | 2026-11-20 (lead) | primary | "Do NOT remove this policy. Instead, please follow the instructions specified in the support case created for you". |
| 8 | [AWS IAM — Update access keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/id-credentials-access-keys-update.html) | no date | 2026-11-20 (lead) | primary | Create the new key, then set the old one to Inactive before deleting it. |
| 9 | [Stripe Docs — API keys](https://docs.stripe.com/keys) (read as `keys.md`) | no date | 2026-11-20 (lead) | primary | Live keys start with `pk_live_`, `rk_live_`, `sk_live_`. The publishable key is safe in client code. When a key is rotated in the Dashboard both keys work for up to 7 days; choosing expiry "Now" removes the old key. |
| 10 | [Slack — Tokens](https://docs.slack.dev/authentication/tokens/) | no date | 2026-11-20 (lead) | primary | Bot tokens begin with `xoxb-`, user tokens `xoxp-`, app-level tokens `xapp-`. |
| 11 | [Supabase — API keys](https://supabase.com/docs/guides/api/api-keys) | no date | 2026-11-20 (lead) | primary | `sb_publishable_…` is "safe to expose online"; `sb_secret_…` bypasses Row Level Security. The legacy `anon` and `service_role` JWT keys are deprecated by the end of 2026. "Never prefix these, or your bundler will ship the key." |
| 12 | [Next.js — Environment variables](https://nextjs.org/docs/app/guides/environment-variables) | no date | 2026-11-20 (lead) | primary | `NEXT_PUBLIC_` variables are inlined into the JavaScript sent to the browser. |
| 13 | [Vite — Env variables and modes](https://vite.dev/guide/env-and-mode) | no date | 2026-11-20 (lead) | primary | "Variables prefixed with VITE_ will be exposed in client-side source code". |
| 14 | [Create React App — Custom environment variables](https://create-react-app.dev/docs/adding-custom-environment-variables/) | no date | 2026-11-20 (lead) | primary | "Do not store any secrets… Environment variables are embedded into the build, meaning anyone can view them". |
| 15 | [Google Maps Platform — API security best practices](https://developers.google.com/maps/api-security-best-practices) | no date | 2026-11-20 (lead) | primary | Restrict keys by application and API. "You are financially responsible for charges caused by abuse of unrestricted API keys." |
| 16 | [Google Cloud — Manage API keys](https://docs.cloud.google.com/docs/authentication/api-keys) | no date | 2026-11-20 (lead) | primary | Rotation is: create a copy with the same restrictions, switch, delete the old key. |
| 17 | [Firebase — API keys](https://firebase.google.com/docs/projects/api-keys) | no date | 2026-11-20 (lead) | primary | Firebase-provisioned keys are restricted to Firebase APIs; access is controlled by IAM, Security Rules and App Check, and restrictions should be applied to every key. |
| 18 | [OpenAI Help — Best practices for API key safety](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety) | no date | 2026-11-20 (lead) | primary | "If you believe your key has been leaked, rotate your key immediately". Set spend limits with hard enforcement. |
| 19 | [Anthropic — API key best practices](https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure) | 2026-10-19 (per scout) | 2026-11-20 (lead) | primary | When a key is detected in a public GitHub repository, Anthropic deactivates it automatically and emails the user. |
| 20 | [Twilio SendGrid — API keys](https://www.twilio.com/docs/sendgrid/ui/account-and-settings/api-keys) | no date | 2026-11-20 (lead) | primary | The key is shown only once; a deleted key cannot be restored. |
| 21 | [Shopify — Rotate or revoke client credentials](https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets/rotate-revoke-client-credentials) | no date | 2026-11-20 (lead) | primary | If a secret is actively misused, revoke it before generating the new one. In a routine rotation, do not revoke the old secret until everything uses the new one. |
| 22 | [npm Docs — Revoking access tokens](https://docs.npmjs.com/revoking-access-tokens) | edited 2025-11-05 | 2026-11-20 (lead) | primary | "There may be a delay of up to an hour before a token is successfully revoked." |
| 23 | [GitLab Docs — Personal access tokens](https://docs.gitlab.com/user/profile/personal_access_tokens/) | no date | 2026-11-20 (lead) | primary | Revoking invalidates the token immediately. |
| 24 | [Mailchimp — About API keys](https://mailchimp.com/help/about-api-keys/) | no date | 2026-11-20 (lead) | primary | Revoke under Account → Extras → API keys, typing REVOKE. Keys give full access to the account. |
| 25 | [Hugging Face — User access tokens](https://huggingface.co/docs/hub/security-tokens) | no date | 2026-11-20 (lead) | primary | Tokens are managed (refresh, delete) under Access Tokens. |
| 26 | [DigitalOcean — Personal access tokens](https://docs.digitalocean.com/reference/api/create-personal-access-token/) | no date | 2026-11-20 (lead) | primary | "If a token becomes compromised, delete it to revoke that token's access." |
| 27 | [WordPress — wp-config.php](https://developer.wordpress.org/apis/wp-config-php/) | no date | 2026-11-20 (lead) | primary | Keys and salts can be changed at any time "to invalidate all existing cookies… all users will have to login again". |
| 28 | [WordPress — Hardening](https://developer.wordpress.org/advanced-administration/security/hardening/) | modified 2026-10-14 (per scout) | 2026-11-20 (lead fetched, fact read by scout) | primary | `wp-config.php` with permissions 400 or 440 and denied from the web. |
| 29 | [gitleaks default rule set](https://raw.githubusercontent.com/gitleaks/gitleaks/master/config/gitleaks.toml) | release v8.30.1, 2026-03-21 | 2026-11-20 (lead) | primary (rule set) | 222 rules. Source of the formats for OpenAI, Anthropic (`sk-ant-api03-`), SendGrid (`SG.`), Shopify (`shpat_`, `shpss_`, `shpca_`, `shppa_`), Google (`AIza`), GitLab, npm, Mailchimp, Hugging Face, DigitalOcean, private keys and JWTs. It has no rule for Stripe `pk_` keys. |
| 30 | [GitGuardian — State of Secrets Sprawl 2026](https://blog.gitguardian.com/the-state-of-secrets-sprawl-2026/) | 2026-03-17 (per scout) | 2026-11-20 (lead) | secondary (vendor report) | 28.65 million new hardcoded secrets in public GitHub commits in 2025 (+34%); more than 64% of the secrets valid in 2022 were still valid in January 2026. |
| 31 | [Aikido — wfx-loot campaign](https://www.aikido.dev/blog/compromised-github-accounts-push-ci-secret-stealer-to-tens-of-thousands-of-repositories) | 2026-11-12 | 2026-11-20 (lead) | secondary (vendor research) | From 2026-11-10, stolen GitHub credentials were used to push a CI secret stealer: a workflow change, or a `.ci-xxxxxx.sh` script with a `postinstall` hook in `package.json`. Vendor-measured figures, no official advisory found. |
| 32 | [Endor Labs — the same campaign](https://www.endorlabs.com/learn/github-actions-supply-chain-attack-targeting-ci-secrets-at-scale) | 2026-11-12, updated 11-13 | 2026-11-20 (scout) | secondary | Independent analysis. Its execution count (1,806) differs from Aikido's (1,835). |
| 33 | [GitHub Changelog — npm install-time security](https://github.blog/changelog/2026-07-08-npm-install-time-security-and-gat-bypass2fa-deprecation/) | 2026-07-08 | 2026-11-20 (scout) | primary | npm 12 runs install scripts only from an allow list. |
| 34 | [GitHub Changelog — unvalidated trusted publishing configurations expire](https://github.blog/changelog/2026-10-02-unvalidated-npm-trusted-publishing-configurations-now-expire) | 2026-10-02 | 2026-11-20 (scout) | primary | Policy change for npm publishing from CI. |
| 35 | [pnpm settings](https://pnpm.io/settings/dependency-resolution) | no date | 2026-11-20 (scout) | primary | `minimumReleaseAge` defaults to 1440 minutes. |
| 36 | [GitHub Community #143554](https://github.com/orgs/community/discussions/143554) | 2024-11-04 | 2026-11-20 (scout) | primary (forum) | "I pushed my .env": the answers suggest reverting the commit, which leaves the key in the history. |
| 37 | [GitHub Community #171795](https://github.com/orgs/community/discussions/171795) | 2025-08-31 | 2026-11-20 (scout) | primary (forum) | The accepted answer tells collaborators to pull; GitHub's guide says rebase. |
| 38 | [GitHub Community #189652](https://github.com/orgs/community/discussions/189652) | 2026-03-15 | 2026-11-20 (scout) | primary (forum) | Belief that `.gitignore` stops a file that is already tracked. |
| 39 | [Unit 42 — exposed IAM keys](https://unit42.paloaltonetworks.com/malicious-operations-of-exposed-iam-keys-cryptojacking) | 2023-10-30 | 2026-11-20 (scout) | secondary | One controlled experiment: a key was used within five minutes of being exposed on GitHub. A single measurement, so the tool does not quote a number of minutes. |
| 40 | [Intruder — 28,000 exposed .git repositories](https://intruder.io/research/api-keys-bank-details-disciplinary-files-what-28-000-exposed-git-repos-gave-up) | 2026-08-20 | 2026-11-20 (scout) | secondary (vendor) | Exposed `.git` folders on web servers held AWS and Stripe keys. The vendor calls it a small sample. |
| 41 | [gitleaks repository](https://github.com/gitleaks/gitleaks) | v8.30.1, 2026-03-21 | 2026-11-20 (scout; release date confirmed by lead through the GitHub API) | primary | Marked feature complete; its author moved to Betterleaks. |
| 42 | [Betterleaks](https://github.com/betterleaks/betterleaks) | v1.10.1, 2026-11-12 | 2026-11-20 (scout) | primary | Command-line scanner; a browser playground exists for testing rules, not for triage. |
| 43 | [TruffleHog](https://github.com/trufflesecurity/trufflehog) | v3.100.0, 2026-11-19 | 2026-11-20 (scout) | primary | 800+ detectors; verification logs in to the provider with the real key. |
| 44 | [GitHub security plans](https://github.com/security/plans) | no date | 2026-11-20 (scout) | primary | Secret Protection for private repositories costs 19 USD per active committer per month. |
| 45 | [ggshield](https://github.com/GitGuardian/ggshield) | v1.56.1, 2026-10-26 | 2026-11-20 (scout) | primary | Needs an account; content is scanned through GitGuardian's API. |
| 46 | [How to Rotate](https://howtorotate.com/docs/introduction/getting-started/) | © 2026 | 2026-11-20 (scout) | primary | 34 rotation tutorials in English; you need to know which key you have first. |
| 47 | [SecurityWall API key checker](https://securitywall.co/tools/api-key-checker) | © 2025 | 2026-11-20 (scout) | secondary (vendor claim) | Says it identifies keys client-side and gives rotation steps, in English. Its behaviour was not tested. |

47 sources: 32 opened by the lead, 15 by scouts only. 39 are primary (provider documentation, rule sets, repositories, changelogs, forum threads).

## What the research changed

- The gap is narrower than first assumed. Pages that identify a pasted key in the browser already exist (source 47). What none of the reviewed pages documents is the combination: a whole file, public-by-design keys set apart, an ordered plan, in Spanish. That absence is an inference from what those pages say, not a measurement.
- The plan follows GitHub's order (sources 1 and 2), not the order forum answers give (36 to 38).
- Provider warnings come from the provider: Stripe's 7 days (9), AWS quarantine (7), Shopify's revoke-first (21), npm's one-hour delay (22), Anthropic's automatic deactivation (19).
- No "attackers use it in N minutes" figure appears in the tool. The only measured source is one experiment from 2023 (39).

## Shortlist and judge

Scores are 1 to 5: usefulness to a small business × freshness × feasibility in one run × shareability.

| Candidate | Use | Fresh | Feasible | Share | Total | Verdict |
|---|---|---|---|---|---|---|
| **Leaked-key triage with an ordered rotation plan** (this tool) | 5 | 3 | 5 | 4 | 300 | Picked. It answers the question a small business has on the worst day, and works on a pasted file. |
| wfx-loot trace finder (paste `package.json`, `git log`, a workflow) | 3 | 5 | 4 | 3 | 180 | Timely, but it rests on indicators from two vendors with no official advisory, it overlaps Gatehouse (experiment 087), and a clean result would not rule the theft out. Candidate for a later run once the indicators settle. |
| Install-defaults auditor (`.npmrc`, `pnpm-workspace.yaml`, `bunfig.toml`) | 2 | 4 | 4 | 2 | 64 | Useful to developers more than to a small business. |
| npm publish expiry calendar | 1 | 4 | 4 | 2 | 32 | Only for businesses that publish packages. |
| `.gitignore` and exposed-file list auditor | 3 | 2 | 5 | 3 | 90 | Smaller; part of its advice is in this tool's step 4 and 5. |

Novelty against the ledger: Leashcheck (093) flags inline secrets inside AI-agent config only; Lockjaw (089) and Gatehouse (087) cover lockfiles and workflows. No earlier entry does triage or rotation.

## Not verified, not used

- Prefix formats in each provider's own documentation for OpenAI, Anthropic, SendGrid, Shopify and Google: the pages opened do not state them, so the tool cites the gitleaks rule set (29) and says so in the README.
- Stack Overflow, Reddit and AWS re:Post could not be opened by the scout.
- Figures seen only in search results (other "minutes to exploitation" numbers, counts of exposed `.env` files) are not cited.
- No GitHub statement about wfx-loot was found.
- The claims of the browser tools in source 47 and similar pages were read, not tested.
