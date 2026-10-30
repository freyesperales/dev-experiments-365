# Research — TOOLTRAP (Friday: hands-on lab)

**Honesty note:** no live web scouting was performed in this run (no scout agents); the shortlist comes from existing knowledge of widely documented bug classes (CWE-22, CWE-78, tool-poisoning/"rug pull" write-ups on MCP, localhost DNS-rebinding). No links are claimed.

## Shortlist and scores (usefulness × freshness × feasibility × shareability, 1-5)
| Candidate | U | F | Fe | S | Total |
|---|---|---|---|---|---|
| **Vulnerable MCP-style tool server lab (chosen)** | 5 | 5 | 4 | 5 | 500 |
| Vulnerable JWT/session lab | 4 | 2 | 5 | 3 | 120 |
| Vulnerable file-upload lab (PHP) | 4 | 2 | 3 | 3 | 72 |

## Demand evidence
Agent/tool-server security is a current, widely discussed defender topic; existing labs mostly cover web-app classics, few combine classic bugs with agent-specific ones (description poisoning) in a runnable, tested form.
