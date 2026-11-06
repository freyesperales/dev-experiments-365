# Solutions — read after you've tried

The fixed code is `lab/app.js` with the `patched` switches on (`node run.js --fixed`). The solver clients are in `exploits.js`; `npm test` proves each one works on the vulnerable lab and fails on the fixed one.

## 1. alg=none (JWT)
**Bug:** `verify()` honoured the token's own `alg` header; `none` skipped the signature check, so `{"sub":3}` became admin.
**Fix:** the *server* decides the algorithm. Require `alg === "HS256"`, require three segments, compare the HMAC in constant time. Better: use a maintained library and pin `algorithms: ['HS256']`.

## 2. BOLA / IDOR (invoices)
**Bug:** the handler authenticated the caller but loaded `invoices[id]` without checking `ownerId`.
**Fix:** authorize per object: `if (inv.ownerId !== me.id) return 404`. Return 404 (not 403) so ids can't be enumerated. Put the check in the data-access layer so no route can forget it.

## 3. SSRF (link preview)
**Bug:** the server fetched any URL, including `127.0.0.1` services that trust "being local" (cloud metadata endpoints are the real-world version).
**Fix:** resolve the name yourself and validate the address the socket really connects to, via a custom `lookup` — this also defeats DNS rebinding and `localhost`-style hostnames. Block loopback, RFC1918, link-local (169.254/16), CGNAT, IPv6 ULA/link-local and IPv4-mapped IPv6; allow only http/https; don't follow redirects blindly; set timeouts and size caps. A URL-string blocklist alone is not a fix. Defence in depth: egress firewall rules and IMDSv2 / metadata hop-limit on cloud hosts.

## 4. Mass assignment (profile)
**Bug:** `Object.assign(user, body)` let the client set `plan` (and `role`).
**Fix:** copy an explicit allowlist (`displayName`) — never spread a request body onto a persisted object. Validate type and length.
