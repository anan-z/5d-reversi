# 5D Reversi

4D spatial Reversi/Othello, plus a temporal retrocausality mechanic: under
strict limits, a player may retroactively place a disc in their own past
turn, and the game deterministically replays every subsequent turn from
that point forward.

Original concept, rules, and design brief by **Anan Zeevy** (Jan 2026),
licensed CC BY 4.0. This repository (code, architecture, and the docs
below) is MIT licensed per the original author's stated intent — see
`LICENSE` and `docs/spec/rules.md` for attribution details.

**Status: pre-implementation.** This repo currently contains the full
spec, architecture decisions, and the agent (AI plugin) protocol,
typechecked and validated but not yet wired to a running engine. See
`docs/roadmap/build-steps.md` for the concrete, gated, step-by-step build
plan and current progress.

## Start here

| If you want to... | Read |
|---|---|
| Understand the game rules | `docs/spec/rules.md` |
| Understand original dev/business context | `docs/spec/dev-brief.md` |
| See what changed from the original spec, and why | `docs/architecture/decisions.md` |
| See how packages fit together | `docs/architecture/overview.md` |
| Follow the build, step by step | `docs/roadmap/build-steps.md` |
| Build an AI to play the game | `docs/protocol/playeragent-spec.md` |
| Understand agent params / where engine code lives / language limits | `docs/protocol/params-and-engine-placement.md` |
| See the actual agent contract types/schema | `packages/protocol/` |

## Key design decisions at a glance

(Full rationale in `docs/architecture/decisions.md`.)

- **Static, client-side only.** No server. Deployable to GitHub Pages.
  Live networked multiplayer and the original local analysis API are
  descoped for v1 in favor of file-based (5DRN) export. — ADR-001
- **Engine is pure and agent-unaware.** Rules logic has zero knowledge
  that "AI" or "agents" exist; a separate `agent-host` layer bridges the
  two. — ADR-007
- **AI is a sandboxed, importable plugin**, not a built-in special case.
  The default AI and any user-imported AI file implement the identical
  `PlayerAgent` protocol and run in the same sandboxed Worker environment
  with no privileged shortcuts. — ADR-005
- **Agent settings are fully declarative.** Difficulty, time limits, or
  any custom parameter an author invents are declared in a manifest and
  rendered into a settings UI generically — no hardcoded settings screen
  per agent. — ADR-006
- **Board size (N) is config-driven from line one.** N=4/6/8 all use the
  same engine and UI primitives; no N=4 special-casing to unwind later.
  — ADR-004
- **The "why is this legal / what just changed" explanation layer is a
  first-class subsystem**, not UI polish bolted on at the end — this was
  identified as harder than the game rules themselves. — ADR-003
- **Canonical history is an ordered move log + a pure reducer**, not an
  array of independently-mutable board snapshots. Snapshots are an
  optional, always-reproducible cache. This is what makes retro-move
  replay a clean "splice and re-run the reducer" operation instead of
  in-place patching of materialized boards. — ADR-009
- **Every game state has a canonical hash.** Cheap fingerprinting for
  replay verification, bug reports, and (later) transposition tables —
  built alongside the board representation in Step 1, not retrofitted.
  — ADR-010

## Repository layout

```
docs/
  spec/            Original design brief, split into rules / dev-brief / api-brief
  architecture/     Decision log (ADRs) + package overview
  roadmap/          Step-by-step, gated build plan
  protocol/         PlayerAgent spec (prose) + params/engine-placement doc

packages/
  protocol/         Agent<->engine contract: protocol.ts + manifest.schema.json
  engine/           (not yet implemented) pure rules engine
  notation/         (not yet implemented) 5DRN serialize/parse
  agent-host/       (not yet implemented) sandboxed Worker runner for agents
  agents/
    random/         (not yet implemented) reference agent
    greedy/         (not yet implemented) reference agent
  web/              (not yet implemented) debug UI + production UI
```

## License

- Original game concept & rules text: CC BY 4.0, Anan Zeevy — see
  `docs/spec/rules.md`.
- Code and repository documentation in this tree: MIT — see `LICENSE`.
