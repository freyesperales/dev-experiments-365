# LEDGERLEAK

A deliberately vulnerable toy invoicing API with four classic API-security bugs — JWT `alg:none`, BOLA/IDOR, SSRF and mass assignment — each with hints, a switchable fix and tests. **For training, local only, never deploy.**

```
1. The token that checks itself — Become admin and read GET /api/admin/flag (the admin user has id 3; you do not know its password).
2. Somebody else's invoice — Read invoice 201, which belongs to bob, while logged in as alice.
3. The server fetches whatever I ask — Make /api/preview return the internal metadata service at http://127.0.0.1:7092/.
4. Upgrade yourself — Reach GET /api/enterprise/report as a free-plan user.

$ node run.js &     # vulnerable API on 127.0.0.1:7091 only
$ curl -s -H "Authorization: Bearer $TOKEN" localhost:7091/api/invoices/201
{"id":201,"ownerId":2,"amount":999,"note":"bob: LAB{check_the_owner_every_time}"}
$ curl -s -H "Authorization: Bearer $TOKEN" "localhost:7091/api/preview?url=http://127.0.0.1:7092/"
{"status":200,"snippet":"internal-metadata: LAB{the_server_is_not_your_proxy}\n"}
```

> **FOR TRAINING. Binds to 127.0.0.1 only and contains only fake `LAB{...}` flags and made-up users. Never expose it or deploy it.**

## Run

```
node run.js            # vulnerable lab (Node 18+, zero dependencies, no accounts)
node run.js hint 3 2   # challenge 3, hint level 2 (levels 1-3)
node run.js --fixed    # the same app with all four fixes on, to compare
npm test               # proves every exploit works on the lab and is blocked when fixed
```

Log in with `alice / alice-pw` or `bob / bob-pw` via `POST /api/login` and send the token as `Authorization: Bearer …`.

## Challenges

| # | Bug class (OWASP API 2023) | Goal |
|---|---|---|
| 1 | Broken authentication — JWT `alg:none` (API2) | Be admin; read `/api/admin/flag` |
| 2 | BOLA / IDOR (API1) | As alice, read bob's invoice 201 |
| 3 | SSRF (API7) | Make `/api/preview` fetch the internal service on :7092 |
| 4 | Mass assignment (API3) | Reach `/api/enterprise/report` on a free plan |

Stuck? `node run.js hint <n>`. Done? Read `solutions/README.md`, then `diff` vulnerable vs fixed behaviour with `--fixed`.

## Why it exists
Most API labs are big, need Docker and hide the bug in noise. This one is ~200 lines you can read in ten minutes, and every fix is a switch you can flip and test — so you learn the *fix*, not just the exploit.

## Sample run (npm test)

```
ok 1 - vulnerable lab: all four exploits work
ok 2 - fixed lab: every exploit is blocked
ok 3 - each fix is independent (patching one does not hide the others)
ok 4 - fixed lab still works for legitimate use
ok 5 - isPrivateAddress covers loopback, RFC1918, link-local, CGNAT, v6 and v4-mapped
# tests 5
# pass 5
# fail 0
```

## Limitations
- Toy app: in-memory data, no TLS, minimal validation outside the four bugs. The "fixed" mode fixes only these four issues — it is not a hardened app.
- The SSRF fix validates resolved addresses and does not follow redirects; real deployments also need egress filtering.
- Only HS256 JWTs are modelled.

---
Daily Security Lab · Experiment 091 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
Built by an AI agent directed by Francisco Reyes (farp.dev)
