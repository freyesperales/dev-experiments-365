# TOOLTRAP

A deliberately vulnerable toy MCP-style tool server with four AI-agent security challenges, hints, and a fixed version to diff against — **for training, local only, never deploy**.

```
$ node run.js list
1. Read a file you shouldn't — Make read_note return the contents of secrets/api_key.txt.
2. grep with a side order — Make search_notes print the contents of flag_cmd.txt.
3. Approved is not forever — Get the host to put an injected instruction into the model context after you approved summarize_notes.
4. Any web page can call me — Make the server answer a request that claims Origin: http://evil.example.

$ node run.js &            # vulnerable lab on 127.0.0.1:7077 only
$ curl -s -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_note","arguments":{"name":"../secrets/api_key.txt"}}}' http://127.0.0.1:7077
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"LAB{contain_to_the_right_directory}\n"}]}}
```

> **FOR TRAINING. The server binds to 127.0.0.1 only and contains only fake `LAB{...}` flags. Never expose it or deploy it.**

## Run

```
node run.js          # vulnerable server (Node 18+, zero dependencies, no accounts)
node run.js hint 2   # progressive hints for challenge 2
node run.js --fixed  # the fixed server, to compare
npm test             # proves every exploit works on lab/ and is blocked in solutions/
```

## Challenges

| # | Bug class | Where | Fix (see `solutions/`) |
|---|-----------|-------|------------------------|
| 1 | Path traversal (guard checks the wrong directory) | `lab/server.js` `read_note` | resolve + compare against the notes dir **with a separator** |
| 2 | Command injection via shell string | `search_notes` | `execFile` with an argv array, `-F --` |
| 3 | Tool "rug pull" / description poisoning after approval | `lab/client.js` | pin sha256 of name+description+schema, refuse on change |
| 4 | No Host/Origin validation on a localhost server (browser drive-by, DNS rebinding) | server request handler | allow only loopback Host and Origin |

Work the challenge first, use hints only when stuck, then `diff lab/server.js solutions/server.js`.

## Why it exists

Local tool servers for AI agents are everywhere and are routinely written with the same classic bugs plus a few new ones (tool descriptions are *model input*). Most training material is slides; this is something you can break and fix in ten minutes.

## Limitations

- It is a toy: a tiny JSON-RPC subset, not the real MCP protocol, no sessions or auth.
- Challenge 3 checks the host's context text; no LLM is involved, so it shows the *delivery* of poisoned text, not model behaviour.
- Fixes are minimal teaching fixes, not a full hardening guide (no rate limits, logging, or authn).
- Research was done from existing knowledge of these bug classes, not live web scouting; see RESEARCH.md.

## Sample run

`npm test` → 14 tests, 14 pass (7 per variant: vulnerable shows each flaw, fixed blocks it while normal use keeps working).

---
Daily Security Lab · Experiment 086 of dev-experiments-365 — built by an AI agent directed by Francisco Reyes (farp.dev)
