# Architecture Overview

For *why* these choices, see `decisions.md` (ADR log). This doc is the
*what* — current intended package layout and how data flows between
layers.

## Layering

```
              ┌─────────────────────────────────┐
              │              web/                │   React UI. Renders board
              │  (production UI + debug UI)       │   slices, timeline, agent
              └───────────────┬───────────────────┘   settings forms.
                              │ imports
              ┌───────────────▼───────────────────┐
              │           agent-host/              │   Only layer that knows
              │  implements AgentHandle from        │   "agents" exist. Creates
              │  packages/protocol; loads/sandboxes  │   sandboxed Workers,
              │  agent Workers; enforces timeouts    │   enforces MoveBudget,
              └───────┬───────────────────┬─────────┘   handles forfeiture.
                      │                   │
        imports       │                   │  imports (types only)
     ┌────────────────▼───┐      ┌────────▼────────────┐
     │      engine/         │      │      protocol/        │  Pure contract:
     │  board, legality,     │      │  protocol.ts +          │  types + JSON
     │  flips, timeline,      │      │  manifest.schema.json   │  Schema. No
     │  retro/replay,          │      │                          │  runtime logic.
     │  rulesets. ZERO          │      └──────────────────────────┘
     │  knowledge of agents.    │                ▲
     └──────────────────────────┘                │ imports (types only)
                                        ┌──────────┴──────────┐
                                        │       agents/          │  RandomAI,
                                        │  (random/, greedy/,      │  GreedyAI —
                                        │   and any user import)   │  reference
                                        └───────────────────────────┘  implementations.

     ┌──────────────────┐
     │    notation/       │  Independent leaf package: 5DRN serialize/
     │  (5DRN format)      │  parse. Used by web/ (export) and a separate
     └──────────────────┘  analysis-viewer app (import). No dependency
                            on engine/ internals beyond the move-list shape.
```

**Dependency direction rule:** arrows only point "up" the diagram — e.g.
`engine/` never imports `protocol/` or `agent-host/` (ADR-007).
`protocol/` never imports anything (it's types + a schema, no logic).
This is what keeps human / built-in AI / imported AI interchangeable: the
engine only ever receives moves, never anything about their origin.

## Data flow for a single AI-driven turn

1. `web/` asks `agent-host/` for a move, having previously called
   `engine/` for the current `legalMoves` and `moveHistory`.
2. `agent-host/` assembles a `MoveRequest` (per `protocol.ts`) and posts it
   into the agent's sandboxed Worker.
3. The agent (built-in or imported, doesn't matter which) computes and
   returns an `AgentMove`, potentially having spawned its own sub-worker
   pool internally (ADR-008) — none of that is visible outside the
   Worker boundary.
4. `agent-host/` enforces `MoveBudget.timeBudgetMs`; on success it returns
   `{ move, terminated: false, elapsedMs }` to `web/`; on timeout/failure
   it returns `{ move: { type: "pass" }, terminated: true, elapsedMs }`
   and tracks the failure count for forfeiture (spec §9).
5. `web/` hands the resulting move to `engine/` exactly as it would a
   human's click — `engine/` applies it, updates the timeline, and (for
   retro moves) runs deterministic replay.
6. `web/` renders the result, including the explanation-layer data
   (ADR-003) the engine produced alongside the state update.

## Package status

Reflects `docs/roadmap/build-steps.md`. Update as steps complete.

| Package | Status | Roadmap step(s) |
|---|---|---|
| `protocol/` | **Spec'd, typechecked** — see files in this package | n/a (contract, precedes implementation) |
| `engine/` | Not started | Steps 1-5 |
| `notation/` | Not started | Step 6 |
| `agent-host/` | Not started | Step 8a (see decisions.md ADR-005) |
| `agents/random`, `agents/greedy` | Not started | Step 8 |
| `web/` (debug UI) | Not started | Step 7 |
| `web/` (production UI) | Not started | Step 12 |
| Analysis viewer (separate app, not yet placed in tree) | Not started | Step 13 |
