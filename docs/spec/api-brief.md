# 5D Reversi — Public API & Debugger Brief (v0.1, original)

Source: original design brief by Anan Zeevy (Jan 2026), CC BY 4.0.

> **Status note:** this describes the original local HTTP/WebSocket
> debug-and-analysis API as specified in the source brief. This repo's v1
> targets a static, client-side-only deployment (see ADR-001), which
> cannot host a listening server. The content below is preserved as the
> design intent for an optional future desktop-shell build (Tauri/Electron
> wrapping the same engine); v1 achieves the equivalent value through
> file-based export (5DRN game logs) rather than a live connection. See
> `docs/architecture/decisions.md`.

## Design goals

- Expose canonical game state only.
- Zero speculative computation.
- Deterministic and read-only.
- Player-centric engine.
- Tool-friendly for analysis and research.

The engine is a state oracle, not a simulator.

## Transport & protocol

- **Protocol:** HTTP/1.1 (+ optional WebSocket for live events)
- **Encoding:** JSON
- **Scope:** local machine or trusted local network (LAN)
- **Purpose:** debugging, replay, analysis, and research tooling
- **Security:** read-only; cannot mutate game state or influence gameplay
- **Default port:** 7351
- **Authentication:** none (debug / research mode only)

## Endpoints (original design)

- `GET /meta` — engine and ruleset metadata
- `GET /turn` — current turn information
- `GET /board?offset=-k` — immutable board snapshot
- `GET /moves` — full move history (forced passes marked with reason)
- `GET /replay/last` — effects of the most recent retro replay
- `GET /geometry` — static geometry constants (line count, corner cells)

## Explicit non-goals

The API does not:
- Validate moves
- Simulate hypothetical moves
- Evaluate positions
- Preview retro outcomes
- Assist AI play

All analysis must be performed externally. **This non-goal is also why, in
this repo, the AI's move-selection search runs in-process against the
engine directly (or via the PlayerAgent protocol) rather than through this
API — minimax search is repeated hypothetical-move simulation, which this
API deliberately does not support.** See ADR-002.

## Philosophy

The engine reports what happened. Tools decide what it means.
