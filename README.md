# dev-experiments-365

Durable state and index for the autonomous daily R&D agent. One development
experiment per day: research the frontier, invent one novel buildable idea,
ship a runnable prototype with tests, publish it.

`state/experiments.json` is the single source of truth for experiment
numbering — never edit it by hand unless repairing a failed run.

## Index

| N | Date | Title | Link | Mode |
|---|------|-------|------|------|
| 001 | 2026-07-09 | mcp-preflight — static migration-readiness checker for the MCP 2026-07-28 spec | [dev-experiment-001](https://github.com/freyesperales/dev-experiment-001) | per-repo |
| 002 | 2026-07-09 | mcp-chaos — fault-injecting MCP proxy and agent resilience scorer | [dev-experiment-002](https://github.com/freyesperales/dev-experiment-002) | per-repo |
| 003 | 2026-07-12 | skill-collider — LLM-free static routing-collision analyzer for Agent Skills (SKILL.md) | [dev-experiment-003](https://github.com/freyesperales/dev-experiment-003) | per-repo |
| 004 | 2026-07-13 | context-xray - LLM-free static perception-gap scanner for MCP tool manifests & Agent Skills | [dev-experiment-004](https://github.com/freyesperales/dev-experiment-004) | per-repo |
| 005 | 2026-07-14 | forkpoint - LLM-free behavioral fork-point analyzer (localizes where agents diverge across repeated runs; OTel gen_ai traces) | [dev-experiment-005](https://github.com/freyesperales/dev-experiment-005) | per-repo |
| 006 | 2026-07-15 | loadout - LLM-free budget-constrained progressive-disclosure planner for MCP tools & Agent Skills (token-budget knapsack -> deployable defer_loading plan + CI gate) | [dev-experiment-006](https://github.com/freyesperales/dev-experiment-006) | per-repo |
| 007 | 2026-07-16 | overreach - LLM-free static annotation-integrity auditor for MCP tool manifests (flags tools whose declared readOnly/destructive/idempotent/openWorld hints under-state actual behavior -> per-tool auto-approval policy + trust score + CI gate) | [dev-experiment-007](https://github.com/freyesperales/dev-experiment-007) | per-repo |
| 008 | 2026-07-17 | contravene - LLM-free variance-aware breaking-change classifier for MCP tool contracts (classifies inputSchema/outputSchema evolution as MAJOR/MINOR/PATCH via input-contravariance vs output-covariance -> required semver bump + CI gate; also flags safety-hint downgrades) | [dev-experiment-008](https://github.com/freyesperales/dev-experiment-008) | per-repo |
| 009 | 2026-07-18 | trifecta - LLM-free static lethal-trifecta capability-flow analyzer for MCP toolsets (classifies each tool by direction x locus into the private/untrusted/exfil legs, detects when a toolset or cross-server bundle closes the exfiltration channel, computes the minimum-cost tools to gate, emits provably trifecta-free per-task catalogs + risk score + CI gate) | [dev-experiment-009](https://github.com/freyesperales/dev-experiment-009) | per-repo |
