# Derrame

A key leaked, or you are not sure: paste the file and see which keys are in it, which ones are dangerous, and what to do first.

En español: pega un `.env`, un `wp-config.php` o un diff de git y Derrame te dice qué claves tiene, de qué proveedor son, cuáles son peligrosas y cuáles son públicas por diseño.
Después te da el orden para rotarlas, con el enlace oficial de cada proveedor. Funciona en tu navegador y no envía nada.

**Live demo:** https://freyesperales.github.io/dev-experiments-365/experiments/experiment-104/ (add `?lang=es` for Spanish)

## Sample run

`node derrame.js --demo diff` runs on a built-in git diff made of fake keys. First part of the output:

```
Derrame 1.0.0  ·  git diff  ·  Act now  (high 2, medium 0, low 0, info 1)

[HIGH]   line 7  githubToken  GitHub  ghp_U4…nI (40)
         Secret. Whoever has it can act as you.
         This line was removed in the diff, but the value stays in the Git history. Removing a line does not un-leak a key.
[HIGH]   line 8  shopifyToken  Shopify  shpat_81…35 (38)
         Secret. Whoever has it can act as you.
         This line was removed in the diff, but the value stays in the Git history. Removing a line does not un-leak a key.
[INFO]   line 11  stripePublishableKey  Stripe  pk_live_…LN (32)
         Public by design. Nothing to rotate.
         The provider documents this key type as safe to publish in a web page or app.

2 placeholder values ignored (your_key_here, xxxx, ${VAR}…).

What to do, in this order

1. Revoke or rotate each key at its provider. Do this first.
   Until the key is revoked, anyone who copied it can still use it. Deleting the file, the commit or the message does not change that.
   • GitHub — githubToken (line 7)
     Settings → Developer settings → Personal access tokens: delete the token, then create a new one with the fewest permissions it needs and an expiry date.
     https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
   • Shopify — shopifyToken (line 8)
     Rotate the app credentials from the app settings. If the key is being misused right now, revoke the leaked secret first and create the new one after, even if the app stops for a while.
     Careful: In a routine rotation it is the other way round: do not revoke the old secret until everything uses the new one, or merchants lose access.
     https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets/rotate-revoke-client-credentials
2. Put the new keys where the old ones were used.
3. Look for use you did not make.
4. Only now, clean the place where it leaked.
5. Keep it from happening again.
```

Steps 2 to 5 print their detail too; it is cut here. The exit code is 1 because there are high findings.

## Install and run

No install. Node 18 or newer, one file:

```
node derrame.js .env                 # or wp-config.php, a saved diff, an alert email saved as text
git diff HEAD~1 | node derrame.js -  # read from standard input
node derrame.js .env --lang es       # Spanish
node derrame.js .env --json          # for scripts; values stay masked
node derrame.js --demo env           # samples: env, wpconfig, diff, clean
```

Exit codes: 0 nothing at or above `--fail-on` (default `high`), 1 findings, 2 usage or input error.

## Who it is for

A small business owner, or the person who runs their website, who got the "we found your key exposed" email, pushed a `.env` by mistake, or found an old `wp-config.php.bak` on the server and does not know which of the 15 values in it matter.

## What it tells you

- **Whose key it is and how bad.** About 20 providers by key format: GitHub, AWS, Stripe, Google, Supabase, OpenAI, Anthropic, SendGrid, Shopify, Slack, GitLab, npm, Mailchimp, Hugging Face, DigitalOcean, private keys, database URLs and JWTs. WordPress database passwords and salts and variables that look like secrets are found by name.
- **Which keys are not a problem.** A Stripe publishable key or a Supabase publishable key is public by design. A Google Maps or Firebase key can be public if it is restricted. Placeholders (`your_key_here`, `${VAR}`, `changeme`) are ignored.
- **Secrets that ship to every visitor.** A secret in a variable called `NEXT_PUBLIC_…`, `VITE_…` or `REACT_APP_…` is written into the JavaScript the browser downloads. Rotating it is not enough; the variable has to change.
- **Lines removed in a diff.** The key is still in the Git history.
- **The order.** Revoke first, then update services, check the logs, clean the history, prevent. With each provider's own warning: Stripe keeps a rotated key alive for up to 7 days unless you pick "Now"; AWS says not to remove its quarantine policy; Shopify says to revoke before reissuing when the key is being abused.

Key values are masked in every output. The demo page forbids itself any network request with `connect-src 'none'`, so you can check that nothing is uploaded.

## Why it exists

- GitHub's own guide puts revoking at step 4 of 9 and cleaning the repository at step 7, yet the first advice people get in forums is to delete the commit: [Remediating a leaked secret](https://docs.github.com/en/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/remediating-a-leaked-secret), [community thread](https://github.com/orgs/community/discussions/143554).
- 28.65 million new secrets reached public GitHub commits in 2025, and more than 64% of the secrets that were valid in 2022 still worked in January 2026: [GitGuardian, State of Secrets Sprawl 2026](https://blog.gitguardian.com/the-state-of-secrets-sprawl-2026/).
- The existing scanners ([gitleaks](https://github.com/gitleaks/gitleaks), TruffleHog, ggshield) are command-line tools for developers that list matches and stop there. None of the ones reviewed separates public-by-design keys or gives an ordered plan in Spanish. Details in [RESEARCH.md](RESEARCH.md).

## Limitations

- It knows a fixed list of formats. A key in an unknown format under a neutral variable name goes unnoticed. "No keys found" is not proof that a file is clean.
- It cannot tell whether a key still works. It never contacts the provider.
- Formats for OpenAI, Anthropic, SendGrid, Shopify, Google, GitLab, npm, Mailchimp, Hugging Face and DigitalOcean come from the gitleaks rule set, not from each provider's documentation, and are matched more loosely than gitleaks does. Expect some false alarms.
- Findings by variable name (`PASSWORD=`, `SECRET=`) are guesses and are labelled as such.
- The browser-prefix check covers Next.js, Vite and Create React App only.
- It reads one pasted text. It does not scan a repository's history; use gitleaks or TruffleHog for that.
- Provider names and menu paths are in English in both languages, as the providers show them. Menus change; the official link next to each one is the reference.
- This is guidance, not incident response. If money moved or customer data was read, you may have legal duties to notify.

## Files

`derrame.js` (tool and library), `index.html` (browser demo), `test/derrame.test.js` (23 tests, `npm test`), `fixtures/` (two clean files), `RESEARCH.md` (sources).

Every fake key in the samples and tests is assembled at run time from pieces, so this repository holds no string in a real key format.

MIT License.

---

Daily Security Lab · Experiment 104 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
