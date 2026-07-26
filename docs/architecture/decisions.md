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

**Worked example** (shape to design `packages/engine`'s move-result output
against; revised twice from external design review feedback, July 2026 —
see revision note below):

```json
{
  "move": { "type": "normal", "coord": [1, 2, 0, 3], "turn": 41 },
  "legal": true,
  "flipEvents": [
    {
      "direction": [1, -1, 0, 1],
      "flippedCoords": [[2, 1, 0, 4], [3, 0, 0, 5]],
      "terminatingDisc": [4, -1, 0, 6]
    }
  ],
  "totalFlips": 7,
  "invalidatedMoves": [
    {
      "turn": 54,
      "reason": "target_cell_occupied",
      "originalCoord": [3, 3, 1, 2]
    }
  ]
}
```

**Revision note:** the first version of this example (a `causalChain`
array of human-readable strings, e.g. `"captured along direction vector
[+1,-1,0,+1]"`) was called "machine-parseable" but wasn't actually
structured — the direction, coordinates, and turn numbers were embedded
as substrings inside prose, which is genuinely hard to consume
programmatically (a property test or a UI component would need to parse
English sentences to extract a coordinate). The shape above puts each
fact in its own field (`direction`, `flippedCoords`, `terminatingDisc`,
`reason`, etc.) instead. Human-readable text (for the debug UI or a
tooltip) becomes a thin rendering step *over* this structured data —
`"captured along [+1,-1,0,+1], flipping 2 discs"` is trivial to generate
from `flipEvents[0]`, but the reverse (recovering structured data from
already-rendered prose) is not something any consumer should have to do.

This is what lets one engine output serve both the debug UI (render
`flipEvents`/`invalidatedMoves` directly, or dump as JSON) and the
production UI's explanation layer (same fields, prettier rendering) from
a single source, per the consequence above — and, unlike the string-array
version, also serve property tests directly (e.g. "assert
`invalidatedMoves` contains turn 54 with reason `target_cell_occupied`")
without string-matching. Exact field names are still not final; this is
a shape to design against in Step 1-2, not a locked schema.

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

### ADR-009: Canonical timeline is an ordered move log + pure reducer, not a snapshot array

**Decision:** The source of truth for game history is `(openingPosition,
[move_0, move_1, ..., move_n])` plus a pure, deterministic reducer function
`(state, move) -> state`. Per-turn board snapshots may still be computed and
cached for fast lookup (e.g. so `/board?offset=-k`-style queries and the UI
don't replay from turn 0 every time), but a cached snapshot is never itself
the source of truth — it must always be reproducible by replaying the
reducer over the move log, and if the two ever disagree, the move log wins.

**Why:** Earlier phrasing (roadmap Step 3, pre-revision) described "timeline
as an array of immutable board snapshots" without specifying whether the
snapshots or the move list were canonical. That ambiguity matters
specifically because of retro moves: if snapshots were canonical, a retro
insertion would require patching an already-materialized array of boards
in place. Under the move-log model, a retro insertion is just: splice the
new move into the log at the correct historical position, then re-run the
reducer forward from there — deterministic forward replay (spec §8) falls
out of the reducer model directly rather than needing separate patching
logic. This is standard event-sourcing, applied here because the domain
(a single canonical timeline that gets rewritten from a point in the past)
is close to the textbook case it's designed for.

**Consequence:** `packages/engine`'s internal turn/replay logic (roadmap
Steps 3-4) is built around the move log + reducer as the actual data
structure, with snapshot caching as a strictly optional performance layer
added after correctness is established — not before. Property tests for
Step 3 must assert the cache and the reducer-replay result can never
diverge, not just that individual snapshots are immutable.

**Credit:** raised by an external design review (ChatGPT, relayed via the
user, July 2026); the earlier phrasing already implied roughly this model
in Step 4's replay tests ("board state is derivable purely from opening
position + ordered move list") but hadn't stated it as the canonical
storage model up front in Step 3, which this ADR fixes.

---

### ADR-010: Deterministic state hashing (two tiers: board hash and position hash)

**Decision:** The engine exposes **two** canonical hash functions, not
one, because they answer different questions and collapsing them into a
single hash causes real collisions:

1. **`hashBoard(board) -> string`** — a stable hash over cell contents
   only. Cheap, and sufficient for what it's used for: confirming that
   two computed board arrays (e.g. cached snapshot vs. fresh reducer
   replay, per ADR-009) contain the same disc placement. This is the hash
   used by the Step 3/4 replay-consistency property tests.
2. **`hashPosition(board, retroQuotaRemaining, rulesetId) -> string`** —
   a stable hash over the board **plus** game-state metadata that affects
   legal future play but isn't part of the board itself. Required for any
   use that treats "same hash" as "same node" for search or deduplication
   purposes — transposition tables (roadmap Step 10) and tournament
   repeated-position detection chief among them.

**Why the split is necessary (not just tidy):** two games can reach
identical board cell contents while one player has already used their
retro move and the other hasn't. Those are *not* the same position for
minimax/transposition-table purposes — the set of legal future moves
differs (one player can still retro, the other can't) — but `hashBoard`
alone would collide them. The original single-hash ADR conflated "is this
board arrangement the same" (a replay-correctness question, board-only)
with "is this game node the same for search" (a position-identity
question, board + quota + ruleset). Using the cheap board-only hash for
the second purpose would silently corrupt a transposition table; using
the heavier position hash for the first purpose would work but pay for
metadata comparisons Step 3/4's tests don't need.

**Consequence:**
- Roadmap Step 1 implements `hashBoard` (cheap, board-only) — this is
  what Steps 3-4's property tests use.
- Roadmap Step 10 (transposition tables) implements `hashPosition`,
  layering retro-quota-remaining and ruleset identity on top of
  `hashBoard`, not before it's actually needed.
- `packages/notation` and bug reports should default to citing
  `hashBoard` for simple replay-divergence reports (cheaper, and quota
  state is already implicit in a full 5DRN move log), reserving
  `hashPosition` for AI/search-internal use.

**Explicitly out of scope for this ADR:** hash *collision handling*
(beyond the specific board-vs-quota collision this ADR exists to avoid),
cryptographic security properties, or using either hash as a substitute
for storing the actual move log (ADR-009 already establishes the move
log as the canonical source of truth — both hashes are fingerprints for
verification/dedup, never a replacement for the underlying state).

**Credit:** original single-hash version raised by external design review
(ChatGPT, relayed via the user, July 2026); the board-vs-position
collision problem and the two-tier fix were raised by a subsequent,
more rigorous external review (Grok, relayed via the user, July 2026).

---

### ADR-011: Retro-legal-move enumeration is engine-provided and cached, not recomputed per search node

**Decision:** `packages/engine` exposes a single function that enumerates
*all* currently-legal moves for a player — normal placements and, where
applicable, retro moves (per player, own-parity past turns within the
retro depth window) — as one API surface (`allLegalMoves` in the existing
package sketches). The engine computes this once per actual game turn.
`agent-host` calls it once to build the `MoveRequest.legalMoves` array
handed to an agent; agents never separately re-derive or validate this
list (per the protocol's existing "you do not need to validate legality"
guarantee).

**Why this needed deciding explicitly:** enumerating retro candidates
requires scanning every eligible past turn (up to the depth window) ×
every empty cell × all 80 directions — meaningfully more expensive than
normal-move enumeration alone, especially at N=8. Left unstated, this
creates a real tension with ADR-007 (engine has zero knowledge of
agents): if retro-candidate enumeration were instead something an agent
was expected to compute itself inside minimax search (recomputing it at
every hypothetical future node, including nodes representing turns where
retro isn't even the real current turn), the cost would multiply by the
search tree's branching factor and depth — potentially dominating total
AI think time. That would also violate the protocol's existing guarantee
that agents don't need to validate/derive legality themselves.

**Resolution:** the expensive retro-candidate scan happens **once**, at
the engine level, for the actual current real-world turn only — not
inside an agent's internal hypothetical search. An agent's own internal
search (minimax exploring hypothetical future positions several plies
deep) is free to approximate or omit retro moves as candidate actions at
hypothetical future nodes for performance — the protocol does not require
an agent's internal search to be retro-aware at every simulated depth,
only that the *actual* move it returns for the *actual* current turn is
chosen from the real `legalMoves` list the host gave it. Roadmap Step 10
("retro-aware search") is about the *reference* AI choosing to model
retro opportunities in its evaluation/search where it deems worthwhile
for playing strength — not a protocol requirement that every agent's
internal search tree re-enumerate retro candidates at every node.

**Consequence:** no change to `packages/protocol/protocol.ts`'s existing
`MoveRequest.legalMoves` shape — it already matches this decision. The
clarification is about *when* the engine computes this (once per real
turn, engine-side) versus what agents are expected to do internally
(whatever they want, at their own performance cost, for their own
hypothetical search).

**Credit:** raised by an external design review (Grok, relayed via the
user, July 2026).

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
