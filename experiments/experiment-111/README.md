# Equipaje

Before you push, publish or deploy, paste the list of files that are leaving: see which ones usually hold passwords and keys, whether they end up in your Git history, your npm package, your Docker image or your public website, and the exact line that stops each one.

En español: pega la lista de archivos que salen de tu carpeta (git, npm, Docker o la carpeta pública de tu hosting) y Equipaje te dice cuáles suelen guardar contraseñas o claves (.env, claves SSH, cuentas de servicio de Firebase, configuración de FTP, respaldos), adónde llegarían y qué línea agregar para detenerlos.
Funciona en tu navegador, sin cuenta y sin subir nada: lee nombres de archivo, nunca su contenido.

**Live demo:** https://freyesperales.github.io/dev-experiments-365/experiments/experiment-111/ (add `?lang=es` for Spanish)

## Sample run

`node equipaje.js --demo folder` runs on an invented shop app: a folder listing plus its `.gitignore`, `.dockerignore`, `.npmignore`, `package.json` and `Dockerfile`. The first screen of the report:

```
Equipaje 1.0.0

>> FIX THIS FIRST — Files that usually hold passwords or keys are leaving with the rest. Each FIX item says where they end up and the line that stops them.

Source: every file in the folder · 18 files read · 6 secret-bearing files found

[FIX]   Your .npmignore replaced your .gitignore
        When a package has an .npmignore, npm stops reading .gitignore. 2 file(s) that
        your .gitignore keeps out of Git would be published.
        - .env
        - api/.env

[FIX]   A .dockerignore line only covers the top folder
        ".env" in .dockerignore excludes it only at the root of the build context;
        "api/.env" in a subfolder still goes in. Docker rules are paths from the root,
        unlike .gitignore.
        → **/.env

[FIX]   Deleting a secret in a later step does not remove it
        Line 6 runs rm on ".env", but the earlier COPY layer still contains it; anyone
        with the image can extract it.
        → Need it during the build? Use a secret mount instead: RUN
          --mount=type=secret,id=env ...
          (https://docs.docker.com/build/building/secrets/)

[CHECK] Secret passed as ARG
        ARG STRIPE_SECRET_KEY (line 3): build arguments and environment variables stay
        in the final image and its history.
```

…followed by one section per destination (Git, npm, Docker) with every file, why it matters, what happens to it and the fix, and a ready-to-paste block of lines for each ignore file.

And on a WordPress hosting folder (`node equipaje.js --demo web --lang es`), where an `.htaccess` rule blocks dotfiles but not what is inside `.git/`:

```
Origen: la carpeta pública del hosting · 10 archivos leídos · 7 archivos con secretos encontrados

== Tu sitio web (la carpeta pública)  (1 regla)
[FIX]   .git/
        La carpeta .git: todo el historial, incluidas contraseñas que se borraron
        después — está en el sitio público: cualquiera que escriba su dirección lo
        descarga.
[FIX]   wp-config.php.bak
        Copia de un archivo de configuración con otra extensión: el servidor la
        entrega como texto en vez de ejecutarla — está en el sitio público: ...
[CHECK] .env
        ... está en el sitio público, pero una regla que pegaste debería bloquearlo.
        regla: <FilesMatch "^\.">
```

## Run it

```
node equipaje.js --dir .                                   # your project folder: reads names and the ignore files there, never contents
git ls-files | node equipaje.js - --from git --gitignore .gitignore
npm pack --dry-run 2>&1 | node equipaje.js -               # what npm would really publish
node equipaje.js listing.txt --from web --webconf .htaccess
node equipaje.js --demo folder|git|npm|web [--lang es] [--json]
```

Node 18+, zero dependencies. Exit codes: `0` nothing to fix, `1` findings at or above `--fail-on` (default `high`; `medium` and `never` also work), `2` usage error or empty list. Or open the [browser demo](https://freyesperales.github.io/dev-experiments-365/experiments/experiment-111/), choose where your list comes from, paste it, and optionally open the box for your ignore files. You can also drop files onto the list box: only their names are read.

**Which list to paste**

| You want to know | Paste |
|---|---|
| What is already in my repository | `git ls-files` (choose "git ls-files") |
| What `git add .` would take | every file in the folder (`dir /s /b`, `find . -type f`) plus your `.gitignore` |
| What my npm package publishes | the output of `npm pack --dry-run` (text or `--json`) |
| What goes into my Docker image | every file in the folder plus `.dockerignore` and `Dockerfile` |
| What my website serves | the file list of `public_html` (hosting file manager or `ls -la`), plus `.htaccess` or nginx rules |

## Who it is for

The owner of a small business website or shop, the freelancer who deploys it by FTP or Git, and the two-person team that publishes a small npm package or a Docker image. No security background needed: each finding says what the file is, where it would end up, and what to type.

## What it checks

- **17 kinds of secret-bearing files** by name: `.env` and its variants (not `.env.example`), SSH and TLS private keys (not `.pub` or `fullchain.pem`), Google Cloud and Firebase service accounts, AWS and Azure credentials, `.git-credentials` and `.netrc`, `.npmrc`/`.pypirc`/`auth.json`/Docker `config.json`, FTP and SFTP client settings (`.vscode/sftp.json`, FileZilla), CMS configuration (`wp-config.php`, Joomla, Drupal, Magento, Rails `master.key`), copies of config files with a new extension (`wp-config.php.bak`), `.htpasswd`, Terraform state and kubeconfig, shell and database history, database dumps and site migration files (`.sql`, `.wpress`), backup archives, the `.git` folder, logs.
- **Four destinations**, each with its own rules: Git (`.gitignore` semantics, tracked files), npm (the `files` field, `.npmignore` over `.gitignore`, the always-included and always-ignored lists), Docker (`.dockerignore` semantics from moby/patternmatcher, which `COPY`/`ADD` lines bring a file into the image), the public web folder (Apache `FilesMatch`/`Files`/`RedirectMatch`/`RewriteRule [F]` and nginx `location ~` deny rules).
- **Five traps the documentation reveals and people fall into:** an `.npmignore` silently replaces `.gitignore`; `.env` in `.dockerignore` covers only the root (`**/.env` covers all); a `.gitignore` line does nothing for a file already committed; `RUN rm .env` after `COPY . .` leaves it in the earlier layer; `ARG`/`ENV` with a secret name stays in the image.
- The severity depends on the destination: `wp-config.php` is normal on a PHP website (it runs, it is not downloaded), but a commit or a package should not carry it; `.npmrc` is never packed by npm, but on a website it is a download.

## Why it exists

- Bots ask websites for `/.env` all day, and owners discover that their CMS does not protect it for them ([WordPress support thread](https://wordpress.org/support/?p=17869961)).
- The ignore rules look alike and are not: `.gitignore` matches a bare name at any depth, `.dockerignore` matches paths from the root, and an `.npmignore` replaces `.gitignore` entirely ([gitignore](https://git-scm.com/docs/gitignore), [Docker build context](https://docs.docker.com/build/concepts/context/), [npm package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)).
- Deleting a secret in a later Docker step does not remove it from the image ([Truffle Security](https://trufflesecurity.com/blog/how-secrets-leak-out-of-docker-images)), and build arguments "persist in the final image" ([Docker build secrets](https://docs.docker.com/build/building/secrets/)).
- The free tools scan file contents (gitleaks, trufflehog, detect-secrets) or test one ignore syntax in English. None says which of *your* files *your* ignore file lets through, per destination, in Spanish, without sending anything anywhere. Full notes in [RESEARCH.md](RESEARCH.md).

## Limitations

- **It reads names, not contents.** A password written inside `src/config.js` does not show up. Run a content scanner too: [Derrame](../experiment-104/) (experiment 104, in the browser) or gitleaks.
- A file with an unusual name (`my-keys.txt`) is invisible to it; a file with a usual name may be harmless (an `.env` with no secrets). Both are why each finding says "usually holds".
- Only the root `.gitignore`, `.dockerignore` and `.npmignore` you paste are applied. Nested ignore files, `core.excludesFile`, `.git/info/exclude` and Dockerfile-specific `.dockerignore` files are not.
- npm packing is modelled from the npm 11 docs; bundled dependencies, workspaces and nested `.npmignore` files are not. `npm pack --dry-run` is the ground truth, so paste its output when you can.
- Web rules are matched as written with JavaScript regular expressions, which are close to but not the same as PCRE; the server's other configuration can override them. Confirm by opening the address in a private window.
- It tells you what to rotate, not how to rotate each provider's key: [Derrame](../experiment-104/) does that.
- Everything in the demos is invented. Nothing is ever fetched from a network; the demo page's own Content-Security-Policy blocks every request.

## Files

`equipaje.js` (library and CLI, also loaded by the page) · `index.html` (browser demo) · `test/equipaje.test.js` (15 tests: `node --test test/equipaje.test.js`) · `RESEARCH.md` · `LICENSE` (MIT)

---
Daily Security Lab · Experiment 111 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
