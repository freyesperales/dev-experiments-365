# Llavero

Before you connect an AI assistant, an automation or any app to your Google or Microsoft 365 account, paste the permissions it asks for and see what it could do with your email, files and calendar, in plain words.

En español: pega los permisos que pide un asistente de IA, una automatización (n8n, Zapier, Make) o cualquier aplicación en tu cuenta de Google o Microsoft 365, y Llavero te dice qué podría hacer con tu correo, tus archivos y tu calendario, qué permiso más acotado pedir y cómo quitarle el acceso.
Funciona en tu navegador, sin cuenta y sin subir nada.

**Live demo:** https://freyesperales.github.io/dev-experiments-365/experiments/experiment-110/ (add `?lang=es` for Spanish)

## Sample run

`node llavero.js --demo n8n` runs on an invented n8n Google credential for an "AI inbox assistant" (Gmail, Drive and Calendar, with the consent link it opened):

```
Llavero 1.0.0

>> FIX THIS FIRST — This app asks for more than an assistant needs, or for something that can hurt your whole account. Each FIX item says what it is and what to ask for instead.

3 permissions found (Google 3 · Microsoft 0)
In plain words, this app can: read your email; send email as you; delete email
for good, skipping the trash; change, move and trash your email; change your
mail settings and filters; see and download your files; change and delete your
files; change who your files or calendars are shared with; see your calendar;
create, change and delete calendar events.

[FIX]   https://mail.google.com/  (Gmail · Llavero's rating: can change or send)
        Everything in your Gmail: read, write, send and delete email for good,
        skipping the trash. Google says to ask for it only to delete permanently.
        Official description: "Read, compose, send, and permanently delete all your email from Gmail"
        · Google: restricted · on Google's high-risk list (a Workspace admin can
          block it)
        · Google says to request this scope only if the app must delete email
          permanently. An assistant almost never needs that.
        → Ask for this instead, if it covers the job: gmail.modify — Read all your
          email, write and send email as you, and move messages to the trash. It
          cannot delete permanently.
        → Ask for this instead, if it covers the job: gmail.readonly — Read all your
          email and your settings. It cannot send or change anything.
[CHECK] It can read your mail or files and also send as you
        An instruction hidden in an email, a web page or a file that the assistant
        reads can tell it to send what it read to someone else (OWASP calls this
        indirect prompt injection). OWASP's advice: the least access that does the
        job, and a person approves risky actions. If the tool has an "ask before
        sending" option, turn it on; or give reading and sending to separate
        connections.
        - reads: https://mail.google.com/, drive
        - sends: https://mail.google.com/
[CHECK] It can change who has access to your files or calendars
        …
[CHECK] It keeps working when you are not there
        The link asks for access_type=offline: Google returns a refresh token so the
        app can keep using these permissions "when the user is not present at the
        browser". …
[CHECK] drive  (Google Drive · Llavero's rating: can change or send)
        See, change, share and delete every file in your Drive.
        Official description: "View and manage all your Drive files"
        · Google: restricted · on Google's high-risk list (a Workspace admin can
          block it)
        → Ask for this instead, if it covers the job: drive.file — Only the files
          you create with this app, open with it or pick for it. Google recommends
          this one.
[CHECK] calendar  (Google Calendar · Llavero's rating: can change or send)
        …

== How to take the access back
- Google account: open the linked apps page, choose "Access to your Google
  Account", pick the app, Remove access.
  https://myaccount.google.com/linkedapps
- Google Workspace admin: Admin console > Security > Access and data control >
  API controls. …
```

Other samples: `--demo chatgpt` (the Google scopes OpenAI publishes for ChatGPT's Google apps: worth checking, mostly because Drive, Docs, Sheets and Slides come with full write access), `--demo outlook` (an invented Microsoft 365 email agent) and `--demo tidy` (a narrow app: `drive.file` and `calendar.freebusy`). Add `--es` for Spanish.

## Run it

- In the browser: open the live demo and paste one of these:
  - the text of the consent screen ("This will allow … to: …");
  - the address of the consent window (it starts with `accounts.google.com` or `login.microsoftonline.com`);
  - the scope field of your n8n, Make or Zapier credential, or the list a developer gave you.
- Command line (Node 18+, no install): `node llavero.js scopes.txt` · `pbpaste | node llavero.js -` · `node llavero.js scopes.txt --es` · `--json` for scripts.
- Exit code: 0 narrow access, 1 worth checking, 2 fix this first, 3 no permissions found.

## What it tells you

For every permission (OAuth scope) it recognises, Llavero gives you:

- what it allows, in plain English or Spanish;
- the vendor's own description, copied word for word;
- Google's own class (non-sensitive, sensitive or restricted) and whether the scope is on Google's admin list of high-risk scopes;
- for Microsoft, whether an administrator must approve it, and what the same name means as an application permission. For example, `Mail.Send` as an application permission is "Send mail as any user";
- the narrower permission to ask for, when there is one. For example, `drive.file` instead of `drive`, which is the scope Google itself recommends.

On top of that, it flags the combinations that matter for AI agents:

- **Read plus send.** The assistant can read your mail or files and can also send as you. That is the shape of an indirect prompt injection.
- **Sharing.** The app can change who has access to your files or calendars.
- **Offline access.** The app keeps working when you are not there (`access_type=offline`, `offline_access`).
- **`.default`.** The app asks for everything it registered, and the list does not show what that is.
- **Unknown scopes.** Llavero lists them as unknown and never guesses.

At the end it tells you how to take the access back: the Google linked apps page, the Workspace admin API controls, or Microsoft's My Apps.

It knows 56 Google Workspace scopes (Gmail, Drive, Sheets, Docs, Slides, Calendar, sign-in) and 45 Microsoft Graph permissions (Outlook mail and calendar, contacts, OneDrive/SharePoint, Teams, To Do, OneNote, directory and admin).

## Who it is for

- The owner of a small business who is about to click "Allow" on ChatGPT, Claude, Copilot, an AI email assistant or a scheduling bot.
- The person who builds the company's n8n, Make or Zapier automations and picks the scopes for a Google or Microsoft credential.
- The Google Workspace or Microsoft 365 admin of a small team who has to decide whether to trust an app.

## Why it exists

- **More agents are coming.** Google is opening Workspace MCP servers to external AI agents across Gmail, Drive and Calendar ([Pulse, 2026-10-14](https://pulse.appsscript.info/p/2026/10/mark-ai-agent-oauth-clients-as-agentic-for-google-workspace-mcp-by-november-11-2026/)), and those agents connect with OAuth scopes.
- **The scope is what an attacker gets.** On 5 November 2026 Microsoft described attackers' AI agents abusing a stolen OAuth app: in one case they went from finding the secret on GitHub to taking data out of Azure Key Vault in five minutes ([Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog/2026/11/05/threat-actors-use-agentic-ai-tooling-to-find-and-abuse-exposed-secrets/)).
- **Same line, different risk.** Material Security points out that `drive.readonly` granted to an AI agent and to a PDF app are the same line in the audit log ([Material Security](https://material.security/resources/the-legacy-oauth-detection-model-doesnt-survive-ai-agents)).
- **Nothing simple existed.** The closest tool found needs Python, Linux and Azure credentials, and covers Microsoft only ([OMGPermissions](https://github.com/ashim-mahara/OMGPermissions)). The vendor pages explain scopes to developers, not to the person who clicks "Allow".

Every source is in [RESEARCH.md](RESEARCH.md), with its date and what was read in it.

## Limitations

- **A scope is a ceiling, not a prediction.** Llavero says what an app *could* do with the permission, not what it does. A well-built assistant can hold a broad scope and use little of it. Read the vendor's privacy page too.
- **Llavero's rating is an opinion.** The "can change or send / can read a lot / limited" rating is Llavero's own. The class (non-sensitive, sensitive, restricted), the descriptions, the high-risk list and the admin-consent flags are copied from Google and Microsoft as read on 2026-11-26. Vendors change them.
- **Calendar has no Google class.** Google's Calendar scope page does not publish a sensitivity class, so Llavero says so instead of guessing.
- **Some scopes are not in the list.** Llavero does not know Contacts, Meet, BigQuery, Forms, Chat or admin scopes. It lists them as unknown, with a link to the vendor's list.
- **Microsoft names do not say which kind they are.** A Microsoft permission name does not tell delegated from application. Llavero shows both meanings; the consent screen or your admin's list tells you which one was granted.
- **Consent-screen text is matched on the vendor's wording.** If Google or Microsoft words the screen differently from the documentation, paste the consent link or the scope list instead.
- **No account is touched.** Llavero cannot see what an app already has. For that, open the Google linked apps page or My Apps.
- **No real account was used.** It was built and tested only with the vendors' public pages and invented inputs. The ChatGPT sample is the list OpenAI publishes.

## Tests

`npm test` (or `node --test test/*.test.js`) runs 25 tests. They cover:

- **Data:** Google's classes and high-risk list, checked against the vendor tables; Microsoft's admin-consent flags and official text; every alternative points to a known scope.
- **Extraction:** scope lists, short names, Graph prefixes, consent links (Google and Microsoft), consent-screen text, and that ordinary words like "email" or "drive" in a sentence are not taken as permissions.
- **Findings:** the read-plus-send, sharing, offline, `.default`, delegated-or-application, admin-consent and unknown-scope findings, and the verdict of each sample.
- **Output:** the Spanish report, and the command line (exit codes, JSON, stdin, bad input).

The browser demo was also checked headless with Playwright: the four samples, both languages, the empty and cleared states, no page errors and no network requests.

## License

MIT

---

Daily Security Lab · Experiment 110 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
