# Research — Experiment 092 (Saturday: maintenance of Lockjaw, exp 089)

Honest note: this cloud run did not use web scouts; the choice is judged from the repo's own documented gaps and prior knowledge. No claims about specific new incidents are made.

## Demand evidence
- Exp 089's README listed "npm only (no yarn.lock / pnpm-lock.yaml yet)" as its top limitation — Yarn Classic lockfiles remain extremely common in older and monorepo JS projects, and attacks via swapped tarballs/registries apply equally.
- The `--noDup` library option was unreachable from the CLI (a real usability bug), and exp 089's README ended with a leftover shell fragment (`echo "$TESTS …"` / `cat <<'E'`) — fixed here.

## Shortlist (usefulness × feasibility × shareability, /5 each)
| Candidate | U | Fe | S | Total |
|---|---|---|---|---|
| **Lockjaw: Yarn Classic support + CLI fixes** | 5 | 5 | 4 | **14** |
| Lockjaw: pnpm-lock.yaml (needs a YAML subset parser) | 5 | 3 | 4 | 12 |
| Gatehouse: more Actions rules | 3 | 4 | 3 | 10 |
| New small tool (header linter) | 3 | 4 | 3 | 10 |

Not chosen: Yarn Berry (needs YAML-ish parsing with different semantics) and pnpm — logged as next steps.
