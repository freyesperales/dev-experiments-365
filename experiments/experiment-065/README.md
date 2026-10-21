# ChatLedger

**Drop a WhatsApp chat export, see who owes you what — in one HTML file, nothing uploaded.**

Small sellers (bakers, honey and clothing shops, freelancers) take orders and payments in WhatsApp and then rebuild a ledger by hand in a spreadsheet. ChatLedger reads the exported `_chat.txt`, finds the money lines (English / Español / Português), attributes them to customers and totals charges vs payments.

## Demo (sample run)

```
$ node cli.js --sample
owner: Panadería Lupita   messages: 13   money lines: 7

customer                charged      paid   balance
Marta Gómez                1730       480      1250
Jorge Ruiz                210.5     210.5         0

1 line(s) need review (ambiguous) — use index.html to resolve them.
```

In the web UI every detected line has a dropdown (charge / payment / ignore) so you fix mistakes in one click and the balances update live; ambiguous lines (questions, "quedan $180 pendientes") are highlighted yellow instead of guessed.

## Run

```bash
node build.js && open index.html      # single self-contained file; drag in _chat.txt
node cli.js _chat.txt --csv ledger.csv  # CLI (zero deps, Node 18+)
npm test                                # 7 tests, node:test
```

WhatsApp: open chat → ⋮ → More → Export chat → *Without media*.

## Why it exists

Order-tracking tools are CRMs with accounts; generic WhatsApp parsers only output raw message rows. See [RESEARCH.md](RESEARCH.md).

## How it works

- Parses iOS (`[12/10/2026, 09:14:02]`) and Android (`12/10/2026, 09:14 -`) exports, 12/24h clocks, multi-line messages, auto-detects DD/MM vs MM/DD.
- Money = a number with a currency mark, or a number near a charge/payment keyword. Locale numbers (`1.234,50`, `1,250`) handled. Times like `5:30` ignored.
- CSV export neutralises spreadsheet formula injection.

## Limitations

- Keyword heuristics, not understanding: expect to correct some lines. Keywords cover English, Spanish, Portuguese only.
- Bare amounts with no keyword or currency sign (e.g. "1,250") are not detected.
- Group chats: owner messages are attributed to the last other person who spoke.
- No currency conversion; mixed currencies are summed naively.
- Not accounting software; no tax/invoice features.

---
Development Experiment 065 of dev-experiments-365
