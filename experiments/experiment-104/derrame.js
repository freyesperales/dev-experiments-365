#!/usr/bin/env node
/*
 * Derrame 1.0.0 — leaked-key triage for small businesses.
 * Paste a .env, a wp-config.php, a git diff or an alert email: which keys are in it,
 * whose they are, which ones are dangerous, which are public by design, and the order
 * to rotate them, with the official link for each provider.
 *
 * Offline. Zero dependencies. Nothing is sent anywhere: this file makes no network call.
 * Key values are masked in every output (text, JSON, browser).
 *
 * Daily Security Lab · Experiment 104 of dev-experiments-365 (MIT).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Derrame = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '1.0.0';

  // ---------------------------------------------------------------------------
  // Providers: what to do, in the provider's own words where they publish it.
  // Every link was opened on 2026-11-20 (see RESEARCH.md).
  // ---------------------------------------------------------------------------
  var PROVIDERS = {
    github: {
      name: 'GitHub',
      link: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens',
      how: {
        en: 'Settings → Developer settings → Personal access tokens: delete the token, then create a new one with the fewest permissions it needs and an expiry date.',
        es: 'Settings → Developer settings → Personal access tokens: borra el token y crea uno nuevo con los permisos mínimos y fecha de caducidad.'
      }
    },
    aws: {
      name: 'Amazon Web Services',
      link: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id-credentials-access-keys-update.html',
      how: {
        en: 'IAM → the user → Security credentials: create a new access key, move your applications to it, set the old key to Inactive and delete it once nothing breaks. Then look at CloudTrail and at your bill for things you did not start.',
        es: 'IAM → el usuario → Security credentials: crea una clave nueva, pasa tus aplicaciones a ella, deja la antigua en Inactive y bórrala cuando nada falle. Después revisa CloudTrail y la factura por recursos que no creaste.'
      },
      warn: {
        en: 'If AWS attached the policy AWSCompromisedKeyQuarantine to the user, do not remove it: follow the support case AWS opened for you (https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSCompromisedKeyQuarantineV3.html).',
        es: 'Si AWS le puso al usuario la política AWSCompromisedKeyQuarantine, no la quites: sigue el caso de soporte que AWS te abrió (https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSCompromisedKeyQuarantineV3.html).'
      }
    },
    stripe: {
      name: 'Stripe',
      link: 'https://docs.stripe.com/keys',
      how: {
        en: 'Dashboard → Developers → API keys → ⋯ → Rotate key. In "Expiration" choose Now.',
        es: 'Dashboard → Desarrolladores → Claves de API → ⋯ → Rotar clave. En «Caducidad» elige Ahora.'
      },
      warn: {
        en: 'Any other expiration leaves the leaked key working, for up to 7 days. After rotating, check the request logs and look for payouts, bank accounts or payments you do not recognise.',
        es: 'Con cualquier otra caducidad la clave filtrada sigue funcionando, hasta 7 días. Después de rotar, revisa los registros de solicitudes y busca transferencias, cuentas bancarias o pagos que no reconozcas.'
      }
    },
    slack: {
      name: 'Slack',
      link: 'https://docs.slack.dev/authentication/tokens/',
      how: {
        en: 'Revoke the token in your Slack app settings and issue a new one. For a webhook URL, delete that webhook and create another.',
        es: 'Revoca el token en la configuración de tu app de Slack y genera uno nuevo. Si es una URL de webhook, borra ese webhook y crea otro.'
      }
    },
    google: {
      name: 'Google (Cloud, Maps, Firebase)',
      link: 'https://docs.cloud.google.com/docs/authentication/api-keys',
      how: {
        en: 'Google Cloud console → APIs & Services → Credentials → the key: add an application restriction (your website or app) and an API restriction (only the APIs you use). If it was public without restrictions, rotate it: create a copy, switch your site to the copy and delete the old key.',
        es: 'Consola de Google Cloud → APIs y servicios → Credenciales → la clave: agrega una restricción de aplicación (tu sitio o app) y una de API (solo las que usas). Si estuvo pública sin restricciones, rótala: crea una copia, cambia tu sitio a la copia y borra la antigua.'
      },
      warn: {
        en: 'Many Google keys are meant to sit in a web page (Maps, Firebase), so the fix is the restriction, not secrecy. Google says you pay for the abuse of an unrestricted key (https://developers.google.com/maps/api-security-best-practices).',
        es: 'Muchas claves de Google están hechas para ir en una página web (Maps, Firebase): el arreglo es la restricción, no esconderla. Google indica que el abuso de una clave sin restricciones lo pagas tú (https://developers.google.com/maps/api-security-best-practices).'
      }
    },
    supabase: {
      name: 'Supabase',
      link: 'https://supabase.com/docs/guides/api/api-keys',
      how: {
        en: 'Dashboard → Project settings → API keys: create a new secret key, move your server to it and delete the leaked one. A secret key skips Row Level Security, so treat the database as readable by whoever had it.',
        es: 'Dashboard → Project settings → API keys: crea una clave secreta nueva, pasa tu servidor a ella y borra la filtrada. Una clave secreta se salta Row Level Security: da por leída la base de datos por quien la tuvo.'
      },
      warn: {
        en: 'Supabase is retiring the old anon and service_role keys (JWTs) by the end of 2026; move to sb_publishable_ and sb_secret_ keys.',
        es: 'Supabase retira las claves antiguas anon y service_role (JWT) a fines de 2026; pásate a las claves sb_publishable_ y sb_secret_.'
      }
    },
    openai: {
      name: 'OpenAI',
      link: 'https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety',
      how: {
        en: 'Platform → API keys: create a new key, update your app and revoke the leaked one. Set a monthly spend limit with hard enforcement so a leaked key cannot run up the bill.',
        es: 'Platform → API keys: crea una clave nueva, actualiza tu aplicación y revoca la filtrada. Pon un límite de gasto mensual con bloqueo para que una clave filtrada no dispare la cuenta.'
      }
    },
    anthropic: {
      name: 'Anthropic (Claude API)',
      link: 'https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure',
      how: {
        en: 'Console → API keys: create a new key, update your app and delete the leaked one.',
        es: 'Console → API keys: crea una clave nueva, actualiza tu aplicación y borra la filtrada.'
      },
      warn: {
        en: 'When GitHub finds an Anthropic key in a public repository, Anthropic deactivates it automatically and emails you. Check that it happened; do not count on it for private repositories or other places.',
        es: 'Cuando GitHub encuentra una clave de Anthropic en un repositorio público, Anthropic la desactiva sola y te avisa por correo. Comprueba que ocurrió; no cuentes con ello en repositorios privados ni en otros lugares.'
      }
    },
    sendgrid: {
      name: 'Twilio SendGrid',
      link: 'https://www.twilio.com/docs/sendgrid/ui/account-and-settings/api-keys',
      how: {
        en: 'Settings → API Keys: delete the leaked key and create a new one (it is shown only once). Then check your sending activity: stolen email keys are used to send spam and phishing in your name.',
        es: 'Settings → API Keys: borra la clave filtrada y crea una nueva (se muestra una sola vez). Después revisa tu actividad de envío: las claves de correo robadas se usan para mandar spam y phishing a tu nombre.'
      }
    },
    shopify: {
      name: 'Shopify',
      link: 'https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets/rotate-revoke-client-credentials',
      how: {
        en: 'Rotate the app credentials from the app settings. If the key is being misused right now, revoke the leaked secret first and create the new one after, even if the app stops for a while.',
        es: 'Rota las credenciales desde la configuración de la app. Si la clave se está usando mal ahora mismo, revoca primero el secreto filtrado y crea el nuevo después, aunque la app se detenga un rato.'
      },
      warn: {
        en: 'In a routine rotation it is the other way round: do not revoke the old secret until everything uses the new one, or merchants lose access.',
        es: 'En una rotación de rutina es al revés: no revoques el secreto antiguo hasta que todo use el nuevo, o los comercios pierden acceso.'
      }
    },
    gitlab: {
      name: 'GitLab',
      link: 'https://docs.gitlab.com/user/profile/personal_access_tokens/',
      how: {
        en: 'User settings → Access tokens → Revoke. It stops working at once. Create a new one with the smallest scope.',
        es: 'User settings → Access tokens → Revoke. Deja de funcionar al instante. Crea uno nuevo con el alcance mínimo.'
      }
    },
    npm: {
      name: 'npm',
      link: 'https://docs.npmjs.com/revoking-access-tokens',
      how: {
        en: 'npmjs.com → your avatar → Access Tokens → delete the token. npm warns it can take up to an hour to take effect, so also check that no new version of your packages was published.',
        es: 'npmjs.com → tu avatar → Access Tokens → borra el token. npm avisa que puede tardar hasta una hora en hacer efecto: revisa además que no se haya publicado una versión nueva de tus paquetes.'
      }
    },
    huggingface: {
      name: 'Hugging Face',
      link: 'https://huggingface.co/docs/hub/security-tokens',
      how: {
        en: 'Settings → Access Tokens → Manage → refresh or delete the token.',
        es: 'Settings → Access Tokens → Manage → renueva o borra el token.'
      }
    },
    digitalocean: {
      name: 'DigitalOcean',
      link: 'https://docs.digitalocean.com/reference/api/create-personal-access-token/',
      how: {
        en: 'Control panel → API → Tokens: delete the token (that revokes it) and create a new one with custom scopes. Check for droplets you did not create.',
        es: 'Panel de control → API → Tokens: borra el token (eso lo revoca) y crea uno nuevo con permisos limitados. Revisa que no haya droplets que no creaste.'
      }
    },
    mailchimp: {
      name: 'Mailchimp',
      link: 'https://mailchimp.com/help/about-api-keys/',
      how: {
        en: 'Profile → Account → Extras → API keys → Revoke (you type REVOKE to confirm), then create a new key. A Mailchimp key gives full access to the account, including your contact list.',
        es: 'Perfil → Cuenta → Extras → Claves API → Revocar (escribes REVOKE para confirmar) y crea una clave nueva. Una clave de Mailchimp da acceso completo a la cuenta, incluida tu lista de contactos.'
      }
    },
    wordpress_db: {
      name: 'WordPress (database password)',
      link: 'https://developer.wordpress.org/advanced-administration/security/hardening/',
      how: {
        en: 'Change the password of the database user in your hosting panel, then write the new one in DB_PASSWORD in wp-config.php. Keep wp-config.php unreadable from the web (permissions 400 or 440) and delete copies such as wp-config.php.bak or .old from the server.',
        es: 'Cambia la contraseña del usuario de la base de datos en el panel de tu hosting y luego escribe la nueva en DB_PASSWORD de wp-config.php. Deja wp-config.php sin lectura desde la web (permisos 400 o 440) y borra del servidor copias como wp-config.php.bak o .old.'
      }
    },
    wordpress_salts: {
      name: 'WordPress (keys and salts)',
      link: 'https://developer.wordpress.org/apis/wp-config-php/',
      how: {
        en: 'Replace the eight keys and salts in wp-config.php with new ones from the official generator (https://api.wordpress.org/secret-key/1.1/salt/). Every user, you included, will have to log in again; that is the point.',
        es: 'Reemplaza las ocho claves y salts de wp-config.php por otras nuevas del generador oficial (https://api.wordpress.org/secret-key/1.1/salt/). Todos los usuarios, tú incluido, tendrán que volver a iniciar sesión; de eso se trata.'
      }
    },
    privatekey: {
      name: 'Private key (SSH, TLS, signing)',
      link: 'https://docs.github.com/en/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/remediating-a-leaked-secret',
      how: {
        en: 'A private key cannot be changed, only replaced: create a new key pair, install the new public key wherever the old one was (servers, GitHub deploy keys, your hosting), remove the old public key from all of them, and reissue the certificate if it was a TLS key.',
        es: 'Una clave privada no se cambia, se reemplaza: crea un par nuevo, instala la clave pública nueva donde estaba la antigua (servidores, deploy keys de GitHub, tu hosting), quita la pública antigua de todos ellos y vuelve a emitir el certificado si era una clave TLS.'
      }
    },
    database: {
      name: 'Database connection string',
      link: 'https://docs.github.com/en/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/remediating-a-leaked-secret',
      how: {
        en: 'Change the password of that database user (hosting panel or the database provider), update the connection string wherever it is used, and check that the database does not accept connections from the whole internet.',
        es: 'Cambia la contraseña de ese usuario de la base de datos (panel del hosting o del proveedor), actualiza la cadena de conexión donde se use y comprueba que la base no acepte conexiones desde todo internet.'
      }
    },
    jwt: {
      name: 'Signed token (JWT)',
      link: 'https://docs.github.com/en/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/remediating-a-leaked-secret',
      how: {
        en: 'A JWT is a signed pass. If it has not expired, revoke it at the service that issued it; if that service cannot revoke single tokens, change its signing secret (everyone logs in again).',
        es: 'Un JWT es un pase firmado. Si no ha vencido, revócalo en el servicio que lo emitió; si ese servicio no puede revocar tokens sueltos, cambia su secreto de firma (todos vuelven a iniciar sesión).'
      }
    },
    generic: {
      name: 'Unknown provider',
      link: 'https://docs.github.com/en/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/remediating-a-leaked-secret',
      how: {
        en: 'The format does not say whose it is. Go by the variable name: change the value in the service that created it, then update it wherever it is used.',
        es: 'El formato no dice de quién es. Guíate por el nombre de la variable: cambia el valor en el servicio que lo creó y luego actualízalo donde se use.'
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Rules. Formats come from the provider's documentation where it publishes one
  // (GitHub, AWS, Stripe, Slack, Supabase) and from the gitleaks rule set otherwise.
  // level: secret | test | temp | restrict | public
  // ---------------------------------------------------------------------------
  var RULES = [
    { id: 'private-key', provider: 'privatekey', level: 'secret', re: /-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----/g, whole: true },
    { id: 'github-pat', provider: 'github', level: 'secret', re: /\bghp_[0-9A-Za-z]{36}\b/g },
    { id: 'github-fine-grained-pat', provider: 'github', level: 'secret', re: /\bgithub_pat_\w{82}\b/g },
    { id: 'github-app-or-oauth-token', provider: 'github', level: 'secret', re: /\bgh[ousr]_[0-9A-Za-z]{36,}\b/g },
    { id: 'aws-access-key-id', provider: 'aws', level: 'secret', re: /\bAKIA[A-Z2-7]{16}\b/g },
    { id: 'aws-temporary-key-id', provider: 'aws', level: 'temp', re: /\bASIA[A-Z2-7]{16}\b/g },
    { id: 'stripe-live-secret-key', provider: 'stripe', level: 'secret', re: /\b[sr]k_live_[A-Za-z0-9]{10,99}\b/g },
    { id: 'stripe-test-secret-key', provider: 'stripe', level: 'test', re: /\b[sr]k_test_[A-Za-z0-9]{10,99}\b/g },
    { id: 'stripe-publishable-key', provider: 'stripe', level: 'public', re: /\bpk_(?:live|test)_[A-Za-z0-9]{10,99}\b/g },
    { id: 'slack-webhook-url', provider: 'slack', level: 'secret', re: /(?:https?:\/\/)?hooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9+\/]{43,56}/g },
    { id: 'slack-token', provider: 'slack', level: 'secret', re: /\bxox[bpe]-[0-9A-Za-z-]{24,}/g },
    { id: 'slack-app-token', provider: 'slack', level: 'secret', re: /\bxapp-\d-[A-Za-z0-9]+-\d+-[A-Za-z0-9]+/g },
    { id: 'google-api-key', provider: 'google', level: 'restrict', re: /\bAIza[\w-]{35}(?![\w-])/g },
    { id: 'supabase-secret-key', provider: 'supabase', level: 'secret', re: /\bsb_secret_[A-Za-z0-9_-]{8,}/g },
    { id: 'supabase-publishable-key', provider: 'supabase', level: 'public', re: /\bsb_publishable_[A-Za-z0-9_-]{8,}/g },
    { id: 'anthropic-api-key', provider: 'anthropic', level: 'secret', re: /\bsk-ant-(?:api03|admin01)-[A-Za-z0-9_-]{20,}/g },
    { id: 'openai-api-key', provider: 'openai', level: 'secret', re: /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}|\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/g },
    { id: 'sendgrid-api-key', provider: 'sendgrid', level: 'secret', re: /\bSG\.[A-Za-z0-9=_.-]{66}(?![A-Za-z0-9=_.-])/g },
    { id: 'shopify-token', provider: 'shopify', level: 'secret', re: /\bshp(?:at|ss|ca|pa)_[a-fA-F0-9]{32}\b/g },
    { id: 'gitlab-pat', provider: 'gitlab', level: 'secret', re: /\bglpat-[\w-]{20,}/g },
    { id: 'npm-access-token', provider: 'npm', level: 'secret', re: /\bnpm_[A-Za-z0-9]{36}\b/g },
    { id: 'digitalocean-pat', provider: 'digitalocean', level: 'secret', re: /\bdop_v1_[a-f0-9]{64}\b/g },
    { id: 'huggingface-token', provider: 'huggingface', level: 'secret', re: /\bhf_[A-Za-z]{34}\b/g },
    { id: 'mailchimp-api-key', provider: 'mailchimp', level: 'secret', re: /\b[a-f0-9]{32}-us\d{1,2}\b/g },
    { id: 'database-url', provider: 'database', level: 'secret', re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?):\/\/[^:\s\/@'"]*:[^@\s'"]+@[^\s'"]+/g, dbUrl: true },
    { id: 'jwt', provider: 'jwt', level: 'secret', re: /\bey[A-Za-z0-9_-]{17,}\.ey[A-Za-z0-9_-]{17,}\.[A-Za-z0-9_-]{10,}/g, jwt: true }
  ];

  var WP_SALTS = ['AUTH_KEY', 'SECURE_AUTH_KEY', 'LOGGED_IN_KEY', 'NONCE_KEY', 'AUTH_SALT', 'SECURE_AUTH_SALT', 'LOGGED_IN_SALT', 'NONCE_SALT'];
  var SUSPECT_NAME = /(pass(?:word|wd|phrase)?|pwd|secret|token|api[_-]?key|apikey|private[_-]?key|access[_-]?key|auth[_-]?key|signing[_-]?key|encryption[_-]?key|credential)/i;
  var PASSWORD_NAME = /(pass(?:word|wd|phrase)?|pwd)/i;
  var PUBLIC_NAME = /(public[_-]?key|publishable|pub[_-]?key|_id$|client[_-]?id|key[_-]?id$|_url$|_uri$|_host$|_path$|_file$|_name$|_ttl$|expir|_length$|_algo|_type$)/i;
  // Verified in each framework's own documentation (Next.js, Vite, Create React App): variables with
  // these prefixes are written into the JavaScript that every visitor downloads.
  var PUBLIC_PREFIX = /^(NEXT_PUBLIC_|VITE_|REACT_APP_)/;

  var SEV_ORDER = { high: 3, medium: 2, low: 1, info: 0 };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function mask(value, keep) {
    var v = String(value);
    var n = v.length;
    var head = Math.min(typeof keep === 'number' ? keep : 4, Math.floor(n / 4));
    var tail = n >= 16 ? 2 : 0;
    return v.slice(0, head) + '…' + (tail ? v.slice(-tail) : '') + ' (' + n + ')';
  }

  function prefixLength(ruleId, value) {
    var m = /^(github_pat_|gh[pousr]_|AKIA|ASIA|[spr]k_(?:live|test)_|xox[bpe]-|xapp-|AIza|sb_secret_|sb_publishable_|sk-ant-(?:api03|admin01)-|sk-(?:proj|svcacct|admin)-|sk-|SG\.|shp(?:at|ss|ca|pa)_|glpat-|npm_|dop_v1_|hf_)/.exec(value);
    return m ? Math.min(m[0].length + 2, Math.floor(value.length / 2)) : 4;
  }

  function isPlaceholder(v) {
    var s = String(v).trim();
    if (!s) return true;
    if (/^(x{3,}|\*{3,}|\.{3,}|-+|_+|change[_-]?me|changeit|null|none|nil|undefined|true|false|yes|no|secret|password|pass|test|testing|dummy|foo|bar|foobar|abc123|redacted|removed|hidden|todo|tbd|n\/a|na|empty|root|admin|localhost)$/i.test(s)) return true;
    if (/^<[^>]*>$|^\$\{[^}]*\}$|^\{\{[^}]*\}\}$|^%[^%]+%$|^\$[A-Z_][A-Z0-9_]*$|^\[[^\]]*\]$/.test(s)) return true;
    if (/your[_ -]|[_-]here\b|example|placeholder|sample|xxxx|\*\*\*\*|replace[_ -]?(?:me|this|with)|insert[_ -]|put[_ -]your|changeme|enter[_ -]your|tu[_ -]clave|tu[_ -]contrase|aqui\b|aquí\b/i.test(s)) return true;
    if (/^(.)\1+$/.test(s)) return true;
    if (/^(process\.env|getenv|env\(|os\.environ|import\.meta|secrets\.|vault:|op:\/\/|\$\(|`)/i.test(s)) return true;
    return false;
  }

  function bodyIsPlaceholder(value) {
    var body = String(value).replace(/^[A-Za-z0-9]*[_.-]/, '');
    return /x{6,}|X{6,}|0{10,}|example|EXAMPLE|placeholder|your[_-]|1234567890/.test(value) || /^(.)\1+$/.test(body);
  }

  function b64urlDecode(s) {
    try {
      var t = s.replace(/-/g, '+').replace(/_/g, '/');
      while (t.length % 4) t += '=';
      if (typeof atob === 'function') return decodeURIComponent(escape(atob(t)));
      return Buffer.from(t, 'base64').toString('utf8');
    } catch (e) { return null; }
  }

  function decodeJwt(token) {
    var parts = token.split('.');
    var raw = b64urlDecode(parts[1] || '');
    if (!raw) return null;
    try { var p = JSON.parse(raw); return p && typeof p === 'object' ? p : null; } catch (e) { return null; }
  }

  function stripValue(v) {
    var s = String(v).trim();
    var q = /^(['"`])([\s\S]*?)\1\s*[;,]?\s*(?:(?:#|\/\/).*)?$/.exec(s);
    if (q) return q[2];
    s = s.replace(/\s+#.*$/, '').replace(/[;,]\s*$/, '').trim();
    return s.replace(/^['"`]|['"`]$/g, '');
  }

  // "NAME=value", "NAME: value", "export NAME=value", "\"name\": \"value\"", PHP define() and $var = '...'.
  function parseAssignment(line) {
    var m = /define\(\s*['"]([A-Za-z_]\w*)['"]\s*,\s*(['"])([\s\S]*?)\2\s*\)/.exec(line);
    if (m) return { name: m[1], value: m[3], php: true };
    m = /\$([A-Za-z_]\w*)\s*=\s*(['"])([\s\S]*?)\2\s*;/.exec(line);
    if (m) return { name: m[1], value: m[3], php: true };
    m = /^\s*(?:export\s+|set\s+|env\s+|-\s+)?["']?([A-Za-z_][\w.-]*)["']?\s*(?::=|=|:)\s*(\S[\s\S]*)$/.exec(line);
    if (m && !/^\/\//.test(m[2])) return { name: m[1], value: stripValue(m[2]), php: false };
    return null;
  }

  function detectKind(text) {
    if (/^(diff --git |@@ -\d|\+\+\+ [ab]\/|--- [ab]\/)/m.test(text)) return 'diff';
    if (/define\(\s*['"]DB_(?:NAME|USER|PASSWORD|HOST)['"]/.test(text)) return 'wp-config';
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim() && !/^\s*#/.test(l); });
    if (!lines.length) return 'empty';
    var kv = lines.filter(function (l) { return /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=/.test(l); }).length;
    if (kv / lines.length >= 0.6) return 'dotenv';
    if (/^\s*[{[]/.test(text) && /"\s*:\s*/.test(text)) return 'json';
    return 'text';
  }

  // ---------------------------------------------------------------------------
  // Analysis
  // ---------------------------------------------------------------------------
  function analyze(input, opts) {
    opts = opts || {};
    var text = String(input == null ? '' : input).replace(/^﻿/, '');
    var now = opts.now ? new Date(opts.now) : new Date();
    var kind = detectKind(text);
    var lines = text.split(/\r?\n/);
    var findings = [];
    var placeholders = 0;
    var seen = {};
    var inKeyBlock = false;

    for (var i = 0; i < lines.length; i++) {
      var rawLine = lines[i];
      var diff = null;
      var line = rawLine;
      if (kind === 'diff') {
        if (/^(diff --git|index |@@|\+\+\+ |--- |new file|deleted file|similarity|rename )/.test(rawLine)) continue;
        if (rawLine.charAt(0) === '+') { diff = 'added'; line = rawLine.slice(1); }
        else if (rawLine.charAt(0) === '-') { diff = 'removed'; line = rawLine.slice(1); }
        else if (rawLine.charAt(0) === ' ') { line = rawLine.slice(1); }
      }
      if (inKeyBlock) { if (/-----END[ A-Z0-9_-]*PRIVATE KEY/.test(line)) inKeyBlock = false; continue; }
      if (line.length > 20000) line = line.slice(0, 20000);

      var asg = parseAssignment(line);
      var spans = [];

      for (var r = 0; r < RULES.length; r++) {
        var rule = RULES[r];
        rule.re.lastIndex = 0;
        var m;
        while ((m = rule.re.exec(line))) {
          var start = m.index, end = m.index + m[0].length;
          if (spans.some(function (s) { return start < s[1] && end > s[0]; })) continue;
          spans.push([start, end]);
          var value = m[0];
          var f = { line: i + 1, name: asg ? asg.name : null, rule: rule.id, provider: rule.provider, level: rule.level, notes: [], diff: diff };

          if (rule.whole) {
            inKeyBlock = !/-----END[ A-Z0-9_-]*PRIVATE KEY/.test(line);
            f.masked = '-----BEGIN … PRIVATE KEY----- (…)';
            f.length = null;
          } else if (rule.dbUrl) {
            var u = /^([a-z+]+):\/\/([^:]*):([^@]+)@/.exec(value);
            if (!u || isPlaceholder(u[3])) { placeholders++; continue; }
            value = u[3];
            f.masked = u[1] + '://' + (u[2] ? u[2].charAt(0) + '…' : '') + ':' + mask(value, 0) + '@…';
            f.length = value.length;
            f.notes.push('dburl');
          } else if (rule.jwt) {
            var payload = decodeJwt(value);
            if (!payload) continue;
            f.masked = mask(value, 6);
            f.length = value.length;
            if (payload.role === 'service_role') { f.provider = 'supabase'; f.rule = 'supabase-legacy-service-role-jwt'; f.notes.push('supabaseService'); }
            else if (payload.role === 'anon' && /supabase/i.test(String(payload.iss || ''))) { f.provider = 'supabase'; f.rule = 'supabase-legacy-anon-jwt'; f.level = 'public'; f.notes.push('supabaseAnon'); }
            if (typeof payload.exp === 'number') {
              f.expires = new Date(payload.exp * 1000).toISOString().slice(0, 10);
              if (payload.exp * 1000 < now.getTime() && f.level !== 'public') { f.level = 'expired'; f.notes.push('jwtExpired'); }
            } else if (f.level !== 'public') { f.notes.push('jwtNoExp'); }
          } else {
            if (bodyIsPlaceholder(value)) { placeholders++; continue; }
            f.masked = mask(value, prefixLength(rule.id, value));
            f.length = value.length;
          }

          if (rule.id === 'aws-access-key-id') f.notes.push('awsPair');
          if (rule.id === 'google-api-key') f.notes.push('googleRestrict');
          if (rule.id === 'stripe-publishable-key' || rule.id === 'supabase-publishable-key') f.notes.push('publicByDesign');
          if (rule.id === 'stripe-test-secret-key') f.notes.push('testMode');
          if (rule.id === 'aws-temporary-key-id') f.notes.push('temporary');
          push(f, value);
        }
      }

      // Name-based findings: the value has no recognisable format, the variable name gives it away.
      if (asg && !spans.length) {
        var nm = asg.name, val = asg.value;
        var g = null;
        if (asg.php && WP_SALTS.indexOf(nm) !== -1) g = { rule: 'wordpress-salt', provider: 'wordpress_salts', level: 'secret', min: 8 };
        else if (asg.php && nm === 'DB_PASSWORD') g = { rule: 'wordpress-db-password', provider: 'wordpress_db', level: 'secret', min: 1 };
        else if (/aws.{0,12}secret/i.test(nm)) g = { rule: 'aws-secret-access-key', provider: 'aws', level: 'secret', min: 20 };
        else if (SUSPECT_NAME.test(nm) && !PUBLIC_NAME.test(nm)) g = { rule: 'named-secret', provider: 'generic', level: 'review', min: PASSWORD_NAME.test(nm) ? 4 : 12 };
        if (g) {
          if (isPlaceholder(val)) { if (val) placeholders++; }
          else if (val.length >= g.min && !/^(https?:\/\/[^@]*|\/[\w.\/-]+|[A-Za-z]:\\.*|\d{1,5}|[\w.-]+\.(?:pem|key|json|txt|crt))$/.test(val)) {
            push({ line: i + 1, name: nm, rule: g.rule, provider: g.provider, level: g.level, notes: g.rule === 'named-secret' ? ['byName'] : [], diff: diff, masked: mask(val, g.rule === 'named-secret' ? 2 : 0), length: val.length }, val);
          }
        }
      }
    }

    function push(f, value) {
      var key = f.rule + '|' + value;
      if (seen[key]) { seen[key].repeats = (seen[key].repeats || 1) + 1; if (f.diff === 'added') seen[key].diff = 'added'; return; }
      seen[key] = f;
      if (f.name && PUBLIC_PREFIX.test(f.name)) {
        f.publicPrefix = PUBLIC_PREFIX.exec(f.name)[1];
        if (f.level === 'secret' || f.level === 'review' || f.level === 'test' || f.level === 'temp') f.notes.push('shippedToBrowser');
        else if (f.level === 'restrict' || f.level === 'public') f.notes.push('publicPrefixOk');
      }
      if (f.diff === 'removed') f.notes.push('removedStillInHistory');
      f.severity = severityOf(f);
      f.providerName = PROVIDERS[f.provider].name;
      findings.push(f);
    }

    findings.sort(function (a, b) { return SEV_ORDER[b.severity] - SEV_ORDER[a.severity] || a.line - b.line; });
    var counts = { high: 0, medium: 0, low: 0, info: 0 };
    findings.forEach(function (f) { counts[f.severity]++; });
    var verdict = counts.high ? 'act' : counts.medium ? 'review' : (counts.low ? 'minor' : 'clear');

    return {
      tool: 'derrame', version: VERSION, kind: kind, lines: lines.length,
      verdict: verdict, counts: counts, placeholdersSkipped: placeholders,
      findings: findings, plan: buildPlan(findings, kind)
    };
  }

  function severityOf(f) {
    if (f.notes.indexOf('shippedToBrowser') !== -1) return 'high';
    if (f.level === 'secret') return 'high';
    if (f.level === 'review' || f.level === 'restrict') return 'medium';
    if (f.level === 'test' || f.level === 'temp') return 'low';
    return 'info';
  }

  // The order follows GitHub's "Remediating a leaked secret": revoke (step 4), update services (5),
  // check for unauthorised access (6), clean the repository (7), prevent (9).
  function buildPlan(findings, kind) {
    var act = findings.filter(function (f) { return f.severity === 'high' || f.severity === 'medium' || f.severity === 'low'; });
    var order = [];
    act.forEach(function (f) { if (order.indexOf(f.provider) === -1) order.push(f.provider); });
    return {
      needed: act.length > 0,
      kind: kind,
      providers: order.map(function (p) {
        var fs = act.filter(function (f) { return f.provider === p; });
        return {
          id: p, name: PROVIDERS[p].name, link: PROVIDERS[p].link,
          severity: fs.reduce(function (a, f) { return SEV_ORDER[f.severity] > SEV_ORDER[a] ? f.severity : a; }, 'info'),
          keys: fs.map(function (f) { return { line: f.line, name: f.name, masked: f.masked, level: f.level }; })
        };
      })
    };
  }

  // ---------------------------------------------------------------------------
  // Text
  // ---------------------------------------------------------------------------
  var T = {
    en: {
      title: 'Derrame', kind: { dotenv: '.env file', 'wp-config': 'wp-config.php', diff: 'git diff', json: 'JSON', text: 'text', empty: 'empty' },
      verdict: { act: 'Act now', review: 'Review', minor: 'Minor', clear: 'No keys found' },
      sev: { high: 'HIGH', medium: 'MEDIUM', low: 'LOW', info: 'INFO' },
      line: 'line', chars: 'characters', times: 'times in this text',
      level: {
        secret: 'Secret. Whoever has it can act as you.',
        review: 'Looks like a secret by its name. The format does not say whose it is.',
        restrict: 'Can be public, but only if it is restricted.',
        test: 'Test-mode key: no real money or data, still worth rotating.',
        temp: 'Temporary key: it expires by itself, usually within hours.',
        public: 'Public by design. Nothing to rotate.',
        expired: 'Already expired. Nothing to rotate.'
      },
      note: {
        shippedToBrowser: function (f) { return 'The variable name starts with ' + f.publicPrefix + ': the build writes this value into the JavaScript that every visitor downloads. Rotating is not enough; rename the variable and use it only on the server.'; },
        publicPrefixOk: function (f) { return 'It is under ' + f.publicPrefix + ', which is fine for a key meant for the browser.'; },
        removedStillInHistory: function () { return 'This line was removed in the diff, but the value stays in the Git history. Removing a line does not un-leak a key.'; },
        awsPair: function () { return 'This is the key ID. It is dangerous together with its secret access key (40 characters), which is usually on the next line.'; },
        googleRestrict: function () { return 'Check its restrictions in the Google Cloud console before deciding it is harmless.'; },
        publicByDesign: function () { return 'The provider documents this key type as safe to publish in a web page or app.'; },
        testMode: function () { return 'Check that the live key (sk_live_ or rk_live_) is not in the same place.'; },
        temporary: function () { return 'It only works with its session token. If the leak is older than a day it is most likely dead.'; },
        byName: function () { return 'Found by the variable name, not by a known format: it may be a false alarm.'; },
        dburl: function () { return 'A connection string with the password inside. Shown here without the host.'; },
        supabaseService: function () { return 'Old Supabase service_role key: full access to the project, it skips Row Level Security.'; },
        supabaseAnon: function () { return 'Old Supabase anon key: meant for the browser. Your data is protected by Row Level Security, not by hiding this key.'; },
        jwtExpired: function (f) { return 'It expired on ' + f.expires + '.'; },
        jwtNoExp: function () { return 'It has no expiry date: it works until someone revokes it.'; }
      },
      skipped: function (n) { return n + ' placeholder value' + (n === 1 ? '' : 's') + ' ignored (your_key_here, xxxx, ${VAR}…).'; },
      none: 'No keys found in this text. That covers the formats this tool knows and the variable names that look like secrets; it is not proof that the file is clean.',
      planTitle: 'What to do, in this order',
      steps: [
        ['1. Revoke or rotate each key at its provider. Do this first.', 'Until the key is revoked, anyone who copied it can still use it. Deleting the file, the commit or the message does not change that.'],
        ['2. Put the new keys where the old ones were used.', 'Your server, your hosting panel, your CI secrets, your teammates\' machines. Then check that the site, the shop and the emails still work.'],
        ['3. Look for use you did not make.', 'Each provider has an activity or request log. Look from the day the key was exposed: charges, emails sent, new users, new servers, changed bank details.'],
        ['4. Only now, clean the place where it leaked.', null],
        ['5. Keep it from happening again.', null]
      ],
      clean: [
        'In a Git repository: the key stays in the history after you delete the file. Rewriting history (git filter-repo) is optional once the key is revoked; GitHub says revoking "may be sufficient".',
        'If you do rewrite history: the old commits stay reachable in forks, in pull requests and by their hash in cached views. GitHub Support removes cached views on request, and collaborators must rebase, not merge, or the key comes back.',
        'Making the repository private, deleting the commit or force-pushing does not un-leak a key that was already public.',
        'On a web server: delete the exposed copy (.env, wp-config.php.bak, backup.zip, .git folder) and block those paths.'
      ],
      prevent: [
        'Add .env to .gitignore before the first commit. If it is already tracked, .gitignore does nothing: run  git rm --cached .env  and commit.',
        'Commit a .env.example with the variable names and empty values, never with real ones.',
        'Push protection on GitHub blocks known key formats before they reach a public repository; it is on by default for your account, and it does not cover every provider.',
        'Give each key the fewest permissions and an expiry date, and use a different key per site or app.'
      ],
      source: 'Order based on GitHub Docs, "Remediating a leaked secret" and "Removing sensitive data from a repository".',
      masked: 'Key values are masked. Nothing was sent anywhere.',
      warn: 'Careful'
    },
    es: {
      title: 'Derrame', kind: { dotenv: 'archivo .env', 'wp-config': 'wp-config.php', diff: 'diff de git', json: 'JSON', text: 'texto', empty: 'vacío' },
      verdict: { act: 'Actúa ahora', review: 'Revisar', minor: 'Menor', clear: 'Sin claves' },
      sev: { high: 'ALTO', medium: 'MEDIO', low: 'BAJO', info: 'INFO' },
      line: 'línea', chars: 'caracteres', times: 'veces en este texto',
      level: {
        secret: 'Secreta. Quien la tenga puede actuar como tú.',
        review: 'Parece un secreto por su nombre. El formato no dice de quién es.',
        restrict: 'Puede ser pública, pero solo si está restringida.',
        test: 'Clave de modo de prueba: sin dinero ni datos reales, igual conviene rotarla.',
        temp: 'Clave temporal: vence sola, normalmente en horas.',
        public: 'Pública por diseño. No hay nada que rotar.',
        expired: 'Ya venció. No hay nada que rotar.'
      },
      note: {
        shippedToBrowser: function (f) { return 'El nombre de la variable empieza con ' + f.publicPrefix + ': la compilación escribe este valor en el JavaScript que descarga cada visitante. No basta con rotarla; cambia el nombre de la variable y úsala solo en el servidor.'; },
        publicPrefixOk: function (f) { return 'Está bajo ' + f.publicPrefix + ', lo que es correcto para una clave hecha para el navegador.'; },
        removedStillInHistory: function () { return 'Esta línea se borró en el diff, pero el valor sigue en el historial de Git. Borrar una línea no deshace la filtración.'; },
        awsPair: function () { return 'Este es el identificador de la clave. Es peligroso junto con su clave secreta (40 caracteres), que suele estar en la línea siguiente.'; },
        googleRestrict: function () { return 'Revisa sus restricciones en la consola de Google Cloud antes de darla por inofensiva.'; },
        publicByDesign: function () { return 'El proveedor documenta este tipo de clave como apta para publicarse en una página web o app.'; },
        testMode: function () { return 'Comprueba que la clave real (sk_live_ o rk_live_) no esté en el mismo lugar.'; },
        temporary: function () { return 'Solo funciona con su token de sesión. Si la filtración tiene más de un día, lo más probable es que ya no sirva.'; },
        byName: function () { return 'Encontrada por el nombre de la variable, no por un formato conocido: puede ser una falsa alarma.'; },
        dburl: function () { return 'Una cadena de conexión con la contraseña dentro. Aquí se muestra sin el servidor.'; },
        supabaseService: function () { return 'Clave service_role antigua de Supabase: acceso completo al proyecto, se salta Row Level Security.'; },
        supabaseAnon: function () { return 'Clave anon antigua de Supabase: hecha para el navegador. Tus datos los protege Row Level Security, no esconder esta clave.'; },
        jwtExpired: function (f) { return 'Venció el ' + f.expires + '.'; },
        jwtNoExp: function () { return 'No tiene fecha de vencimiento: funciona hasta que alguien la revoque.'; }
      },
      skipped: function (n) { return n + ' valor' + (n === 1 ? '' : 'es') + ' de relleno ignorado' + (n === 1 ? '' : 's') + ' (your_key_here, xxxx, ${VAR}…).'; },
      none: 'No se encontraron claves en este texto. Eso cubre los formatos que esta herramienta conoce y los nombres de variable que parecen secretos; no prueba que el archivo esté limpio.',
      planTitle: 'Qué hacer, en este orden',
      steps: [
        ['1. Revoca o rota cada clave en su proveedor. Esto va primero.', 'Mientras la clave no esté revocada, quien la haya copiado puede seguir usándola. Borrar el archivo, el commit o el mensaje no cambia eso.'],
        ['2. Pon las claves nuevas donde se usaban las antiguas.', 'Tu servidor, el panel del hosting, los secretos de CI, los equipos de tus compañeros. Después comprueba que el sitio, la tienda y los correos sigan funcionando.'],
        ['3. Busca usos que no hiciste tú.', 'Cada proveedor tiene un registro de actividad o de solicitudes. Mira desde el día en que la clave quedó expuesta: cobros, correos enviados, usuarios nuevos, servidores nuevos, datos bancarios cambiados.'],
        ['4. Recién ahora, limpia el lugar donde se filtró.', null],
        ['5. Evita que se repita.', null]
      ],
      clean: [
        'En un repositorio Git: la clave sigue en el historial después de borrar el archivo. Reescribir el historial (git filter-repo) es opcional una vez revocada la clave; GitHub dice que revocar «puede ser suficiente».',
        'Si reescribes el historial: los commits antiguos siguen accesibles en forks, en pull requests y por su hash en vistas en caché. El Soporte de GitHub borra las vistas en caché si se lo pides, y los colaboradores deben hacer rebase, no merge, o la clave vuelve.',
        'Hacer privado el repositorio, borrar el commit o forzar el push no deshace la filtración de una clave que ya fue pública.',
        'En un servidor web: borra la copia expuesta (.env, wp-config.php.bak, backup.zip, carpeta .git) y bloquea esas rutas.'
      ],
      prevent: [
        'Agrega .env a .gitignore antes del primer commit. Si el archivo ya está bajo seguimiento, .gitignore no hace nada: ejecuta  git rm --cached .env  y haz commit.',
        'Sube un .env.example con los nombres de las variables y los valores vacíos, nunca con los reales.',
        'La protección de push de GitHub bloquea formatos de clave conocidos antes de que lleguen a un repositorio público; viene activada en tu cuenta y no cubre a todos los proveedores.',
        'Dale a cada clave los permisos mínimos y una fecha de caducidad, y usa una clave distinta por sitio o aplicación.'
      ],
      source: 'Orden basado en GitHub Docs, «Remediating a leaked secret» y «Removing sensitive data from a repository».',
      masked: 'Los valores de las claves van enmascarados. No se envió nada a ningún lado.',
      warn: 'Cuidado'
    }
  };

  function describe(f, lang) {
    var t = T[lang] || T.en;
    return {
      level: t.level[f.level],
      notes: f.notes.map(function (n) { return t.note[n] ? t.note[n](f) : n; })
    };
  }

  function planText(result, lang) {
    var t = T[lang] || T.en;
    var out = [];
    if (!result.plan.needed) return out;
    out.push(t.planTitle);
    out.push('');
    out.push(t.steps[0][0]);
    out.push('   ' + t.steps[0][1]);
    result.plan.providers.forEach(function (p) {
      var P = PROVIDERS[p.id];
      out.push('   • ' + P.name + ' — ' + p.keys.map(function (k) { return (k.name ? k.name + ' ' : '') + '(' + t.line + ' ' + k.line + ')'; }).join(', '));
      out.push('     ' + (P.how[lang] || P.how.en));
      if (P.warn) out.push('     ' + t.warn + ': ' + (P.warn[lang] || P.warn.en));
      out.push('     ' + P.link);
    });
    out.push(t.steps[1][0]); out.push('   ' + t.steps[1][1]);
    out.push(t.steps[2][0]); out.push('   ' + t.steps[2][1]);
    out.push(t.steps[3][0]); t.clean.forEach(function (c) { out.push('   • ' + c); });
    out.push(t.steps[4][0]); t.prevent.forEach(function (c) { out.push('   • ' + c); });
    out.push('');
    out.push(t.source);
    return out;
  }

  function render(result, lang) {
    lang = T[lang] ? lang : 'en';
    var t = T[lang];
    var c = result.counts;
    var out = [];
    out.push('Derrame ' + VERSION + '  ·  ' + t.kind[result.kind] + '  ·  ' + t.verdict[result.verdict] + '  (high ' + c.high + ', medium ' + c.medium + ', low ' + c.low + ', info ' + c.info + ')');
    out.push('');
    if (!result.findings.length) out.push(t.none);
    result.findings.forEach(function (f) {
      var d = describe(f, lang);
      var pad = ('[' + t.sev[f.severity] + ']       ').slice(0, 9);
      out.push(pad + t.line + ' ' + f.line + '  ' + (f.name ? f.name + '  ' : '') + f.providerName + '  ' + f.masked + (f.repeats ? '  ×' + f.repeats : ''));
      out.push('         ' + d.level);
      d.notes.forEach(function (n) { out.push('         ' + n); });
    });
    if (result.placeholdersSkipped) { out.push(''); out.push(t.skipped(result.placeholdersSkipped)); }
    var plan = planText(result, lang);
    if (plan.length) { out.push(''); out = out.concat(plan); }
    out.push('');
    out.push(t.masked);
    return out.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Demo samples. The fake keys are assembled at run time from pieces, so this
  // repository never contains a string in a real key format.
  // ---------------------------------------------------------------------------
  function fake(n, alphabet, seed) {
    var a = alphabet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var x = (seed || 7) * 2654435761 % 4294967296, s = '';
    for (var i = 0; i < n; i++) { x = (x * 1664525 + 1013904223) % 4294967296; s += a.charAt(Math.floor(x / 4294967296 * a.length)); }
    return s;
  }
  var HEX = '0123456789abcdef', B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function b64url(obj) {
    var s = JSON.stringify(obj);
    var b = typeof btoa === 'function' ? btoa(s) : Buffer.from(s).toString('base64');
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fakeKeys() {
    return {
      stripeLive: 'sk' + '_live_' + fake(24, null, 1),
      stripeTest: 'sk' + '_test_' + fake(24, null, 2),
      stripePub: 'pk' + '_live_' + fake(24, null, 3),
      github: 'gh' + 'p_' + fake(36, null, 4),
      awsId: 'AK' + 'IA' + fake(16, B32, 5),
      awsSecret: fake(40, null, 6),
      google: 'AI' + 'za' + fake(35, null, 8),
      sendgrid: 'S' + 'G.' + fake(22, null, 9) + '.' + fake(43, null, 10),
      openai: 's' + 'k-proj-' + fake(48, null, 11),
      anthropic: 's' + 'k-ant-api03-' + fake(40, null, 12),
      shopify: 'shp' + 'at_' + fake(32, HEX, 13),
      mailchimp: fake(32, HEX, 14) + '-us' + '21',
      slack: 'xo' + 'xb-' + fake(12, '0123456789', 15) + '-' + fake(12, '0123456789', 16) + '-' + fake(24, null, 17),
      supabaseSecret: 'sb' + '_secret_' + fake(32, null, 18),
      supabasePub: 'sb' + '_publishable_' + fake(32, null, 19),
      npm: 'np' + 'm_' + fake(36, null, 20),
      dbPass: fake(14, null, 21),
      jwtService: b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({ iss: 'supabase', ref: 'demoprojectref', role: 'service_role', iat: 1700000000, exp: 2015000000 }) + '.' + fake(43, null, 22),
      salt: function (i) { return fake(64, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#%^&*()-_[]{}<>~+=,.;:/?|', 30 + i); }
    };
  }
  function samples() {
    var k = fakeKeys();
    return {
      env: [
        '# .env of an online shop (demo: every key below is fake)',
        'APP_URL=https://shop.example',
        'STRIPE_SECRET_KEY=' + k.stripeLive,
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=' + k.stripePub,
        'NEXT_PUBLIC_OPENAI_API_KEY=' + k.openai,
        'NEXT_PUBLIC_GOOGLE_MAPS_KEY=' + k.google,
        'SENDGRID_API_KEY=' + k.sendgrid,
        'DATABASE_URL=postgres://shop:' + k.dbPass + '@db.internal.example:5432/shop',
        'AWS_ACCESS_KEY_ID=' + k.awsId,
        'AWS_SECRET_ACCESS_KEY=' + k.awsSecret,
        'SUPABASE_SERVICE_ROLE_KEY=' + k.jwtService,
        'MAILCHIMP_API_KEY=your_mailchimp_key_here',
        'ADMIN_PASSWORD=' + fake(10, null, 23)
      ].join('\n'),
      wpconfig: [
        '<?php',
        '// wp-config.php.bak left on the server (demo: every value below is fake)',
        "define( 'DB_NAME', 'shop_wp' );",
        "define( 'DB_USER', 'shop_wp' );",
        "define( 'DB_PASSWORD', '" + fake(16, null, 24) + "' );",
        "define( 'DB_HOST', 'localhost' );",
        "define( 'AUTH_KEY',         '" + k.salt(1) + "' );",
        "define( 'SECURE_AUTH_KEY',  '" + k.salt(2) + "' );",
        "define( 'LOGGED_IN_KEY',    '" + k.salt(3) + "' );",
        "define( 'NONCE_KEY',        '" + k.salt(4) + "' );",
        "define( 'AUTH_SALT',        'put your unique phrase here' );",
        "define( 'WP_DEBUG', false );",
        "define( 'WPMS_SMTP_PASS', '" + k.sendgrid + "' );"
      ].join('\n'),
      diff: [
        'diff --git a/config.js b/config.js',
        'index 3f1a2bc..9d4e5f6 100644',
        '--- a/config.js',
        '+++ b/config.js',
        '@@ -1,6 +1,6 @@',
        ' module.exports = {',
        '-  githubToken: "' + k.github + '",',
        '-  shopifyToken: "' + k.shopify + '",',
        '+  githubToken: process.env.GITHUB_TOKEN,',
        '+  shopifyToken: process.env.SHOPIFY_TOKEN,',
        '   stripePublishableKey: "' + k.stripePub + '",',
        ' };'
      ].join('\n'),
      clean: [
        '# .env.example (safe to commit: names only)',
        'APP_URL=http://localhost:3000',
        'STRIPE_SECRET_KEY=',
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx',
        'SENDGRID_API_KEY=your_sendgrid_key_here',
        'DATABASE_URL=postgres://user:password@localhost:5432/app',
        'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE',
        'ADMIN_PASSWORD=changeme',
        'SESSION_SECRET=${SESSION_SECRET}'
      ].join('\n')
    };
  }

  var api = { VERSION: VERSION, analyze: analyze, render: render, describe: describe, planText: planText, samples: samples, PROVIDERS: PROVIDERS, RULES: RULES, T: T, _fake: fake, _fakeKeys: fakeKeys, _mask: mask, _isPlaceholder: isPlaceholder };

  // ---------------------------------------------------------------------------
  // CLI
  // ---------------------------------------------------------------------------
  if (typeof require === 'function' && typeof module === 'object' && require.main === module) {
    var fs = require('fs');
    var argv = process.argv.slice(2);
    var o = { lang: 'en', failOn: 'high', json: false, file: null, demo: null };
    for (var a = 0; a < argv.length; a++) {
      var arg = argv[a];
      if (arg === '--help' || arg === '-h') {
        console.log('Derrame ' + VERSION + ' — which keys are in this file, which are dangerous, and the order to rotate them.\n' +
          'Usage: node derrame.js [.env|wp-config.php|change.diff|alert.txt|-] [--lang en|es] [--json] [--fail-on high|medium|low|never]\n' +
          '       git diff | node derrame.js -            read from standard input\n' +
          '       node derrame.js --demo env|wpconfig|diff|clean   run on a built-in sample made of fake keys\n' +
          'Offline: no network call. Key values are masked in every output.\n' +
          'Exit codes: 0 ok, 1 findings at/above --fail-on (default high), 2 usage/input error.');
        process.exit(0);
      } else if (arg === '--json') o.json = true;
      else if (arg === '--lang') o.lang = argv[++a];
      else if (arg === '--fail-on') o.failOn = argv[++a];
      else if (arg === '--demo') o.demo = argv[++a];
      else if (arg === '--version') { console.log(VERSION); process.exit(0); }
      else if (arg.charAt(0) === '-' && arg !== '-') { console.error('Unknown option: ' + arg + ' (try --help)'); process.exit(2); }
      else o.file = arg;
    }
    if (!T[o.lang]) { console.error('--lang must be en or es'); process.exit(2); }
    if (['high', 'medium', 'low', 'never'].indexOf(o.failOn) === -1) { console.error('--fail-on must be high, medium, low or never'); process.exit(2); }
    var inputText;
    try {
      if (o.demo) {
        var all = samples();
        if (!all[o.demo]) { console.error('--demo must be one of: ' + Object.keys(all).join(', ')); process.exit(2); }
        inputText = all[o.demo];
      } else if (!o.file) { console.error('Give a file, "-" for standard input, or --demo env (try --help)'); process.exit(2); }
      else inputText = fs.readFileSync(o.file === '-' ? 0 : o.file, 'utf8');
    } catch (e) { console.error('Cannot read ' + o.file + ': ' + e.message); process.exit(2); }
    var res = analyze(inputText);
    console.log(o.json ? JSON.stringify(res, null, 2) : render(res, o.lang));
    var worst = res.counts.high ? 3 : res.counts.medium ? 2 : res.counts.low ? 1 : 0;
    process.exit(o.failOn !== 'never' && worst >= SEV_ORDER[o.failOn] && worst > 0 ? 1 : 0);
  }

  return api;
});
