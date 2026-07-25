# Architecture Decision Records

Lightweight ADR log. Each entry: the decision, why, and what it overrides
or resolves from the original spec docs in `docs/spec/`. Numbered in the
order they were made, not necessarily the order they'd be read.

---

### ADR-001: Static client-side deployment, no live server

**Decision:** v1 ships as a static site (GitHub Pages-deployable). No
server component. The original brief's local HTTP/WebSocket analysis API
(`docs/spec/api-brief.md`) is not implemented as a live service in v1.

**Why:** The original brief describes both "runs client-side in the
browser" and a server binding a port (`Default Port: 7351`) with a
WebSocket for live analysis tools — a browser tab cannot open a listening
TCP socket, so these two requirements are mutually exclusive as stated.
Rather than compromise the "no server, static hosting, offline play, no
account" value proposition, the server-based analysis API is descoped.

**What replaces it:** File-based analysis. Games export to a 5DRN text log
(`docs/spec/dev-brief.md` §5, `packages/notation`); a separate standalone
analysis viewer app (roadmap Step 13) loads a log file and provides the
chess-GUI-style timeline/replay experience without a live connection.

**Future option, not v1:** An optional desktop-shell build (Tauri/
Electron) wrapping the same engine could genuinely host the original
local HTTP/WebSocket API for live spectating/analysis tools, since it
isn't constrained to the browser sandbox. This would be a separate
distribution target, not a requirement for the core game.

---

### ADR-002: AI does not use the read-only analysis API

**Decision:** The built-in AI and any imported `PlayerAgent` operate
in-process against the engine (or through the `PlayerAgent` protocol),
never through the read-only debug/analysis API described in
`docs/spec/api-brief.md`.

**Why:** That API's explicit non-goals rule out move validation, position
evaluation, and hypothetical-move simulation. Minimax/alpha-beta search
*is* exactly that — potentially millions of simulated positions per move.
Forcing AI search through an HTTP interface (which also doesn't exist live
in v1 per ADR-001) would be unworkable at any meaningful search depth.

**What's preserved from the original intent:** The spec's underlying
principle — "AI should not get privileged access to hidden game state" —
is kept, just implemented one layer down: every `PlayerAgent` (built-in or
imported) sees only canonical board state, legal moves, and move history,
identical to what an external analysis tool would see. There is no
special internal API only the built-in AI can call.

---

### ADR-003: Explanation layer is a first-class subsystem, not UI polish

**Decision:** Every move and replay effect produces a structured
explanation object (what flipped, along which of the 80 directions, why a
turn was invalidated by replay) as engine/analysis output, not just
human-readable UI text.

**Why:** A player looking at up to sixteen (or sixty-four, at N=8) small
4D-slice boards has no innate intuition for why a move is legal or what a
retro insertion just changed. This was identified as probably a larger
engineering effort than the core game rules themselves, and the highest-
risk area for player drop-off (see `docs/spec/dev-brief.md` §4).

**Consequence:** The production UI (roadmap Step 12) is required to
render its explanations from the same structured data the debug UI
consumes — not a separately hand-written, UI-specific explanation string
per screen.

---

### ADR-004: Board size is config-driven from day one

**Decision:** `dimension_count` and `board_size` are `GameConfig` fields
from the first line of engine code (roadmap Step 1). Nothing in the engine
hardcodes N=4.

**Why:** The setup rule in `docs/spec/rules.md` §4.1 is already defined
generally for any even N ≥ 4; special-casing N=4 in the engine would mean
redoing that work later for N=6/8, which the brief explicitly wants
supported.

**Related consequence (UI):** A grid-of-N²-boards UI (as in the original
mockup) scales quadratically and becomes unusable at N=8 (64 grids). The
UI's core primitive is a single-slice view with two axis-pair scrubbers
(constant size regardless of N), with a virtualized "many slices at once"
overview mode as an opt-in for smaller N. See `docs/spec/dev-brief.md`
§1 UI row and the debug UI notes in `docs/roadmap/build-steps.md` Step 7.

---

### ADR-005: Agents are sandboxed, protocol-driven, and untrusted by default

**Decision:** Every player that isn't human — built-in default AI or a
user-imported file — implements the same `PlayerAgent` protocol
(`packages/protocol/protocol.ts`), runs inside a sandboxed Web Worker with
no DOM/network/storage access, and is subject to a hard per-move time
budget enforced by the host.

**Why:** Import-a-custom-AI was a stated goal. Treating "our AI" and
"someone's imported file" as the same trust tier (rather than giving the
built-in AI privileged in-process shortcuts) is what makes the import
feature safe without a second, separately-audited code path. See
`docs/protocol/playeragent-spec.md` §1 and §8.

**Consequences:**
- Agent settings (difficulty, time limit, or any custom parameter such as
  a hypothetical "quantum fluctuations" knob) are declared, not hardcoded
  — see ADR-006.
- v1 language surface is JS/TS (or anything compiling to JS). WASM-with-
  no-host-imports is the identified path for a stronger sandboxing
  guarantee later; native binaries are out of scope for the browser-only
  architecture. See `docs/protocol/params-and-engine-placement.md` §3.

---

### ADR-006: Agent parameters are declarative, not hardcoded fields

**Decision:** An agent's configurable knobs (difficulty, think time, or
anything else, including things not anticipated in advance) are declared
in `manifest.params`, validated against `packages/protocol/
manifest.schema.json`, and rendered into a settings form by the shell
generically — there is no fixed `{ difficulty, timeLimit }` struct baked
into the protocol.

**Why:** Requirement was explicitly "difficulty, time limits, quantum
fluctuations, whatever" — an open-ended set of parameters an agent author
should be able to define without a protocol change.

**Resolved sub-decision:** an agent's declared `timeLimitMs` param (by
convention, not protocol-level enforcement) is what the shell reads to
set the actual `MoveBudget.timeBudgetMs` ceiling for that agent — avoiding
two independent, potentially-disagreeing numbers (an agent-internal
"limit" vs. a shell-enforced budget). See
`docs/protocol/params-and-engine-placement.md` §1.

---

### ADR-007: Engine package has zero knowledge of agents or players

**Decision:** `packages/engine` implements only rules (board, legality,
flips, timeline, retro/replay, rulesets). It has no dependency on
`packages/protocol` or `packages/agent-host`, and no concept of "who" is
producing a move.

**Why:** This is what makes human / built-in AI / imported AI genuinely
interchangeable — `packages/agent-host` is the only layer that knows
agents exist, translating engine state into `MoveRequest` objects and
agent responses back into engine move calls. See
`docs/protocol/params-and-engine-placement.md` §2 for the full package
dependency direction.

---

### ADR-008: Parallelism is each agent's own responsibility

**Decision:** The host does not manage a shared worker pool on behalf of
agents. An agent that wants to use multiple cores spawns and manages its
own sub-worker tree inside its sandboxed worker, receiving
`hardwareConcurrency` once (in `InitContext`) rather than querying it
per-worker.

**Why:** Keeps the `PlayerAgent` protocol surface minimal
(`describe/init/requestMove`-shaped) instead of also having to specify a
work-distribution API between host and agent. Matches how a native
program would use `multiprocessing`/`std::thread` — the OS schedules
across cores, the host doesn't need to broker it.

**Known sharp edges (not solved by this decision, documented as
constraints instead):** nested-worker support varies by browser (weak in
Safari); shared-memory search (`SharedArrayBuffer`) needs COOP/COEP
headers not guaranteed present; parent-worker termination doesn't reliably
cascade to grandchildren, so agents must self-enforce their deadline with
a safety margin rather than relying solely on host termination. See
`docs/protocol/playeragent-spec.md` §6-7.

---

## Open items (not yet decided)

- **Agent commentary/explanation channel.** The protocol currently has no
  way for an agent to return "why I chose this move" data for the UI to
  display, which would pair naturally with ADR-003's explanation layer.
  Flagged in `docs/protocol/params-and-engine-placement.md` §4, not yet
  designed.
- **Failure-forfeit threshold.** `docs/protocol/playeragent-spec.md` §9
  proposes forfeiting an agent after 3 consecutive `init`/`requestMove`
  failures, to prevent an infinite pass-loop game. This default hasn't
  been explicitly confirmed.
