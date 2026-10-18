# OrderPaste

Turn a WhatsApp order chat into an order sheet, a pick list and a CSV — in one HTML file, offline, no API, no account.

> Built by the daily routine on 2026-10-18; published on 2026-10-22 because the push failed (GitHub access). Reconstructed from the run's own event log.

```
 WhatsApp export                                   Order sheet
 ───────────────────────────────────────           ─────────────────────────────────────────────
 Carla: Quiero 2 docenas de empanadas      ──▶     #1 Carla   24× Empanada de carne            63.00
   de carne y media docena de pollo                            6× Empanada de pollo
 Carla: y 1 torta de chocolate                                 1× Torta de chocolate
 Carla: Dirección: Av. Libertad 345                -> Av. Libertad 345, depto 2B
 Jorge: alfajores x6, 2 cafés y un jugo    ──▶     #2 Jorge   6× Alfajor; 2× Café; 1× Jugo     13.70 [CANCELLED]
 Jorge: cancela mi pedido porfa
 Marta: 3 empnadas de carne y 4 chipas     ──▶     #3 Marta   3× Empanada de carne (fuzzy)      4.50
                                                   + "chipas ×1" suggested for your catalog
```

## Run it

```bash
# the web app: just open the file (works from disk, offline)
open index.html            # or double-click it; click “Load demo”

# the CLI (Node >= 18, zero dependencies)
node cli.js --demo
node cli.js chat.txt catalog.txt --ignore "My Shop" --out out/

# tests
npm test
```

In WhatsApp: *Chat → ⋮ → More → Export chat → Without media*. Drop the `.txt` (or the `.zip` that iPhone gives you) on the page.

## Why it exists

Small sellers — bakeries, food stalls, craft shops, resellers — take orders in WhatsApp and re-type them into a sheet. That works at 5 orders a day and becomes a part-time job at 50. The automations that exist need the paid WhatsApp Business API, n8n/Zapier, or a forms workaround. OrderPaste uses the one thing every seller already has: the chat export. Because it runs locally, customer names, phone numbers and addresses never leave the machine.

## How it reads a chat

- **Formats**: Android (`31/12/2025, 21:41 - Name: …`) and iOS (`[12/31/25, 9:41:05 PM] Name: …`), 12h/24h, Spanish `p. m.`, multi-line messages, system lines and `<Media omitted>` skipped. DD/MM vs MM/DD is inferred from the data (and flagged when it cannot be).
- **Catalog** (`name | price | alias, alias`): matches accents, plurals, multi-word names and aliases; one-letter typos are matched but marked as *fuzzy* so you review them.
- **Quantities**: `2`, `dos`, `un/una`, `x3`, `3x`, `una docena`, `media docena`, `2 docenas de`, `1,5 kg de`; works for both “2 pizza 1 coke” and “pizza 2 coke 1” styles. Numbers in Spanish, English and Portuguese.
- **Orders**: consecutive messages from one person within N minutes (default 30) are one order; addresses (`dirección:`, `envío a`, `address:`…) and phone numbers are attached; “cancela / cancel / ya no quiero” cancels it.
- **Never silently wrong**: messages with numbers but no known product land in a *Check* tab, and unknown words that follow a quantity are suggested as new catalog entries (“chipas ×4”, click to add). Products without a price flag the order total with `+`.
- **Output**: orders.csv, lines.csv (one row per item), pick-list.csv, or “Copy for Sheets”. CSV cells starting with `= + - @` are neutralised so a customer cannot plant a formula in your spreadsheet.

## Sample run

`node cli.js --demo`:

```
ORDERS (4)
#1 2026-10-14 08:15  Carla Méndez       24× Empanada de carne; 6× Empanada de pollo; 1× Torta de chocolate 63.00
   -> Av. Libertad 345, depto 2B
#2 2026-10-14 09:02  Jorge Ruiz         6× Alfajor; 2× Café; 1× Jugo de naranja              13.70 [CANCELLED]
   tel +54 9 11 5555-0142
#3 2026-10-14 10:30  Marta L.           3× Empanada de carne                                 4.50
#4 2026-10-14 12:10  Luis Paz           2× Torta de chocolate                                36.00
   -> Calle 9 #12-30

PICK LIST
Empanada de carne          27  (2 orders)
Empanada de pollo           6  (1 order)
Torta de chocolate          3  (2 orders)

Maybe add to your catalog: chipas (x1)
```

## Limitations

- It is a rule-based parser, not an LLM: unusual phrasing (“lo mismo de ayer”, “mejor 3 en vez de 2”) is not understood — corrections after an order become a new line, not an edit. Review the Orders tab before acting; fuzzy matches are outlined.
- Customers who order in several unrelated bursts less than N minutes apart are merged; raise/lower the gap.
- Products with sizes/variants (“pizza grande”) need one catalog entry per variant, or aliases.
- The shop’s own replies must be ignored (tick the sender in the page / `--ignore`); otherwise “tenemos 2 pizzas listas” becomes an order. With exactly two participants the page guesses this for you.
- Chat exports in languages/date styles other than the ones above (e.g. Arabic-Indic digits, Japanese dates) are not supported yet. `.zip` exports need a browser with `DecompressionStream` (any current one) or Node 18+.
- Prices are one number per product (no discounts, taxes or delivery fees).

---

Development Experiment 077 of dev-experiments-365
