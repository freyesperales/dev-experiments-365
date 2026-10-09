# Spoolslip

Drop a sliced `.3mf` / `.gcode` and get a print receipt: time, grams of filament, and what the job actually cost, entirely offline.

> Built by the daily routine on 2026-10-09; published on 2026-10-22 because the push failed (GitHub access). Reconstructed from the run's own event log.

```
$ npm run fixtures && node cli.mjs fixtures/benchy.gcode.3mf
SPOOLSLIP
--------------------------------------------
benchy.gcode.3mf
Bambu Studio / Orca 01.09.00.70 | C11 | 0.4 mm nozzle
2 plates
Objects: Benchy & Friends.stl
--------------------------------------------
Print time                            1h 47m
Filament 1 PLA                       14.88 g
Filament 2 PETG                       6.62 g
Filament 3 PLA                        5.00 g
--------------------------------------------
Material                               $0.53
Energy (0.21 kWh)                      $0.03
--------------------------------------------
TOTAL                                  $0.56
```

## Run it

- **Browser:** open `index.html` (a single file, no build, no network). Or `npm start` and visit http://127.0.0.1:8065.
- **CLI:** `node cli.mjs [--price 20] [--kwh 0.15] [--watts 120] [--by-type "PLA=18,PETG=22"] [--csv|--json] files...`
- **Sample files:** `npm run fixtures` generates small synthetic `.gcode` / `.gcode.3mf` files in `fixtures/`.
- **Tests:** `npm test` (Node 20+, zero dependencies)

## Why it exists

Slicers show time and filament only inside their own app, one job at a time, and some of that now lives behind cloud logins. If you sell prints, split costs with a makerspace, or just want to know what a Benchy costs, you end up retyping numbers into a spreadsheet. Spoolslip reads the numbers your slicer already wrote into the file, applies your prices, and gives you a table and a CSV for many files at once. Files never leave your machine.

## What it reads

| Source | Read from |
|---|---|
| Bambu Studio / OrcaSlicer `.gcode.3mf` | `Metadata/slice_info.config` (per plate, per filament), plus embedded plate G-code |
| `.gcode` from Bambu Studio, OrcaSlicer, PrusaSlicer, SuperSlicer | header / footer comment statistics |
| `.gcode` from Cura | `;TIME:` and `;Filament used:` (grams estimated from length, density and diameter, and marked `est.`) |

Cost = filament grams x price per kg (optionally per material, with a purge/failure %), plus electricity (hours x average watts x price per kWh), plus optional machine wear per hour and markup. Settings persist in your browser's localStorage. Large G-code files are never fully loaded: only the first and last 300 KB are read.

## Limitations

- Format support was written from slicer output conventions and tested against synthetic fixtures in this repo, not a large corpus of real files. Real-world variants may need fixes; please open an issue with a file header.
- Binary G-code (`.bgcode`) is not supported; the tool says so and tells you how to export plain G-code.
- A project `.3mf` that was never sliced contains no print data, and Spoolslip reports that rather than guessing.
- Energy uses a flat average wattage. Heated beds and enclosures make real draw vary; measure with a plug meter for accuracy.
- Costs trust the slicer's own estimates; failed prints, purge towers and spool tare are not modelled beyond the percentage you set.
- No ZIP64 support. Needs a browser with `DecompressionStream` (current Chrome, Edge, Firefox, Safari).
- CSV file names beginning with `= + - @` are prefixed with `'` to prevent spreadsheet formula injection.

## Sample run

`npm test`: 17 tests, 17 passing (parsers for each slicer, ZIP reader incl. corrupt/unsliced/bgcode cases, large-file head/tail, cost math, CSV safety, offline-only guarantee). Browser smoke test with headless Chromium loading three fixture files rendered the table, totals row, error row and receipt with no console errors.

---
Development Experiment 068 of dev-experiments-365
