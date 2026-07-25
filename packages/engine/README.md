# packages/engine

**Status: not yet implemented.** Build via `docs/roadmap/build-steps.md`
Steps 1-5.

Pure game rules only: board representation, 80-direction legality/flip
checking, timeline snapshots, retro insertion + deterministic replay,
pluggable rulesets (Standard / NoRetro / ShortMemory / MultiRetro).

**Hard constraint (ADR-007, see docs/architecture/decisions.md):** this
package must never import `packages/protocol` or `packages/agent-host`.
It has no concept of players, agents, or AI — only board state and moves.
