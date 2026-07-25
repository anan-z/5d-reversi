# 5D Reversi — Build Roadmap: Prompt-by-Prompt

Each step below is a self-contained prompt you can hand me (or paste into a fresh
conversation/session) once the previous step's gate is passed. Don't skip a gate —
the engine steps (1-5) are the foundation everything else sits on, and bugs there
are far more expensive to find later.

---

## Step 0 — Repo scaffolding
**Prompt:** "Scaffold the 5D Reversi monorepo: pnpm workspaces, TypeScript strict
mode, `packages/engine` `packages/notation` `packages/ai` `packages/web` as empty
packages, ESLint + Prettier, Vitest, GitHub Actions CI running lint+test on push,
MIT LICENSE, README stub."

**Goal:** Empty but installable/buildable monorepo. No game logic yet.

**Test before moving on:**
- `pnpm install` succeeds
- `pnpm build` succeeds (even with zero-content packages)
- CI badge goes green on first push

---

## Step 1 — Engine: board + config (no rules yet)
**Prompt:** "In `packages/engine`, implement `GameConfig` (dimension_count,
board_size, max_retro_depth) and a `Board` class backed by a flat `Int8Array`
(not nested arrays), with coordinate<->index conversion for arbitrary N and
dimension_count=4. Include the parity-based opening setup from the spec
(Section 4.1) generalized for any even N. Also implement a canonical
`hashBoard(board) -> string` function per ADR-010
(docs/architecture/decisions.md) — a stable hash over the board's cell
contents — since later steps' property tests will assert on hash equality
rather than full board comparison."

**Goal:** You can construct a board at N=4/6/8 and get the correct 16-disc
opening position at each size, and hash any board state to a stable string.

**Test before moving on:**
- Unit test: N=4 board matches the exact 16 coordinates from Section 4.2 of the spec
- Unit test: N=6 and N=8 boards produce a legal, symmetric, parity-correct opening
- Unit test: coordinate<->index round-trips for all cells at N=4,6,8
- Unit test: `hashBoard` is stable (same board contents -> same hash across
  repeated calls) and sensitive (changing any single cell changes the hash)

---

## Step 2 — Engine: move legality + flipping
**Prompt:** "Implement the 80-direction line scan, legal move detection, and
simultaneous flip application, per spec Section 5. A move is legal only if it
flips ≥1 disc."

**Goal:** Given any board state, you can list legal moves for a player and
apply a move correctly.

**Test before moving on:**
- Unit tests for each of a handful of hand-worked positions (compute expected
  flips by hand for 3-5 opening-adjacent moves, assert engine matches)
- Property test: a move is never returned as "legal" if it flips zero discs
- Property test: total disc count only ever increases by exactly 1 per normal move
  (flips convert color, they don't add/remove discs)

---

## Step 3 — Engine: timeline, turns, passing, game end
**Prompt:** "Implement the turn loop using an event-sourced model per ADR-009
(docs/architecture/decisions.md): the canonical timeline is an ordered move
log plus a pure `(state, move) -> state` reducer, not an array of
independently-mutable snapshots. Board snapshots may still be computed and
cached per turn for fast lookup, but must always be reproducible by replaying
the reducer over the move log from the opening position — the cache is never
the source of truth. Implement standard turn execution, forced pass when no
legal move exists, game-end detection on consecutive passes, and winner
determination (majority discs, White wins ties) per spec Section 9."

**Goal:** A full game can be played start-to-finish with only normal moves
(no retro yet) and produces a correct winner.

**Test before moving on:**
- Property test: playing any sequence of legal normal moves to game-end always
  terminates and produces a valid winner
- Property test: any cached snapshot is truly immutable (mutating a returned
  snapshot doesn't affect the timeline)
- Property test: for every turn, `reducer.replay(moveLog[0..n])` equals the
  cached snapshot at turn n — the cache and the source of truth can never
  diverge, by construction, not just by convention
- Property test (ADR-010): `hashBoard(reducer.replay(moveLog[0..n]))` equals
  `hashBoard(cachedSnapshotAtTurn(n))` for every turn — same check as above,
  expressed as the cheap hash comparison that later steps and CI failure
  logs will actually use day to day
- Run 1,000+ random-legal-move self-play games in CI, assert no crashes/invariant violations

---

## Step 4 — Engine: retro moves + deterministic replay
**Prompt:** "Implement retro move insertion (own-parity past turn, within
max_retro_depth, target cell empty at that snapshot, causes ≥1 flip) and
deterministic forward replay per spec Section 7-8: re-execute all subsequent
original moves, skip (forced-pass) any that become illegal."

**Goal:** This is the core novel mechanic — treat it as the highest-risk code
in the project.

**Test before moving on:**
- Property test: replaying a retro insertion twice with identical inputs
  produces byte-identical resulting timelines (determinism)
- Property test (ADR-010): replaying a retro insertion twice with identical
  inputs produces the *same final hash* — the practical, cheap version of
  the determinism check above, and the form CI failures/bug reports should
  actually cite (e.g. "diverges at turn 31: expected hash abc123, got def456")
- Property test: a retro move can never be inserted onto a non-empty cell in
  the target snapshot
- Property test: after replay, every turn's board state is derivable purely
  from (opening position + ordered move list) — i.e., replay-from-scratch
  equals incremental-update
- Regression corpus: hand-construct 5-10 specific retro scenarios (including
  a cascading multi-turn invalidation) with manually verified expected output
  **and expected hash**, commit as fixtures
- **This is the gate to spend real time on.** Don't proceed to Step 5 until
  you've thrown thousands of randomized games with random retro insertions at
  this and nothing has diverged or crashed.

---

## Step 5 — Rulesets (pluggable variants)
**Prompt:** "Refactor legality/retro-depth/game-end checks behind a `Ruleset`
interface. Implement StandardRules, NoRetroRules, ShortMemoryRules per spec
Section 10."

**Goal:** Engine takes a ruleset object; switching variants doesn't touch
engine internals.

**Test before moving on:**
- Same property-test suite from Steps 2-4 now runs parametrized across all
  three rulesets
- Confirm NoRetroRules genuinely makes retro insertion always illegal (not
  just unused)

---

## Step 6 — Notation (5DRN)
**Prompt:** "Implement `packages/notation`: serialize/parse the notation from
spec Section 5 — `(w,x,y,z)@Tn` and `R(w,x,y,z)@Tk~Tn` — to/from the engine's
move list. Round-trip a full game to text and back."

**Goal:** Any game (including retro-heavy ones) can be exported to a small
text file and reconstructed exactly.

**Test before moving on:**
- Property test: `parse(serialize(game)) === game` for randomly generated
  games, including retro moves
- Manually inspect a serialized output file for readability — this is a
  human/tooling-facing format, so eyeball it, don't just trust the round-trip test

---

## Step 7 — Debug UI (single-slice + scrubber, not grid-of-grids)
**Prompt:** "Build a bare-bones React debug UI in `packages/web`: one N×N
`BoardSliceView` for a chosen axis pair (dropdown: WX/WY/WZ/XY/XZ/YZ) with
two scrubbers for the fixed coordinates, click-to-move, legal move
highlighting, and a turn timeline slider. No styling effort — this is a tool,
not the product."

**Goal:** You can play a full game by hand through the UI and visually verify
engine behavior, including retro moves, at N=4 and N=8.

**Test before moving on:**
- Manually play a full game through the UI, including at least one retro
  move, and confirm what you see matches what `/moves` history says happened
- Confirm the UI doesn't degrade at N=8 (this is the scaling fix from our
  earlier discussion — single-slice view should be constant-size regardless of N)

---

## Step 8 — AI: naive tiers (random → greedy)
**Prompt:** "In `packages/ai`, implement `RandomAI` and `GreedyAI` (maximize
immediate flip count), operating directly against the engine in-process (not
through any API). Wire into the debug UI as an opponent option."

**Goal:** You can play against a trivial but legal-move-respecting opponent.

**Test before moving on:**
- Run RandomAI vs RandomAI for 500+ games in CI — no crashes, no illegal
  moves, games always terminate
- Play GreedyAI by hand a few times — should feel obviously beatable but not broken

---

## Step 9 — AI: minimax + alpha-beta
**Prompt:** "Implement minimax with alpha-beta pruning and a basic positional
evaluation function (disc count + mobility), fixed depth, no retro-awareness
yet. Add depth as a configurable difficulty parameter."

**Goal:** A genuinely challenging single-threaded opponent at N=4.

**Test before moving on:**
- Benchmark: measure wall-clock time per move at depth 2/4/6 on N=4, N=6, N=8
  — this tells you whether you need Web Workers before or after retro-awareness
- MinimaxAI(depth=4) should beat GreedyAI in the large majority of games over
  20+ self-play matches — if it doesn't, the eval function or search has a bug

---

## Step 10 — AI: retro-aware search + iterative deepening
**Prompt:** "Extend the search to consider retro moves as candidate actions
at applicable turns, add iterative deepening with a time budget, and wire up
the difficulty tiers (Easy/Medium/Hard/Nightmare/Go Cry To Mama™) from our
earlier discussion as config presets."

**Goal:** Difficulty tiers behave as designed — Easy is genuinely weak, not
handicapped-but-still-optimal.

**Test before moving on:**
- Round-robin tournament: each difficulty tier vs. every other tier, 10 games
  each, confirm win rate ordering matches intended difficulty ordering
- Confirm Nightmare/Go Cry To Mama™ respects its time budget (doesn't blow
  past configured think-time)

---

## Step 11 — Web Workers parallelization
**Prompt:** "Move AI search into a Web Worker pool, splitting root-move
evaluation across `navigator.hardwareConcurrency` workers with a CPU-usage
selector (Auto/4/8/16/All) in the UI."

**Goal:** Higher-thread machines search measurably deeper/faster without
freezing the UI thread.

**Test before moving on:**
- Confirm UI stays responsive (no jank) while AI is thinking
- Benchmark nodes-searched-per-second scaling on whatever multi-core machine
  you have access to — confirm it roughly scales with worker count (don't
  expect linear; confirm it's not flat)

---

## Step 12 — Production UI + explanation layer
**Prompt:** "Build the real UI on top of the debug UI's `BoardSliceView`
primitive: flip previews, the explanation layer (why is this move legal /
what flips / why did retro invalidate turn N), retro mode entry flow, and the
mobile-style layout from the Section 3 mockup."

**Goal:** Something a first-time player could plausibly use without reading
the rules doc first.

**Test before moving on:**
- Get one person who has *not* read the spec to play a full game unaided;
  note every point of confusion
- Confirm explanation text is generated from the same structured move data
  as the debug UI, not duplicated/hand-written per screen

---

## Step 13 — Export/analysis viewer
**Prompt:** "Build a standalone analysis viewer app that loads a 5DRN file
(no live connection) and renders a chess.com-style timeline with per-turn
board state, using the notation package's parser."

**Goal:** Any exported game can be replayed and inspected outside the main app.

**Test before moving on:**
- Export a game with retro moves from Step 7's debug UI, load it in the
  viewer, confirm the timeline (including invalidated/forced-pass turns)
  matches what actually happened

---

## Notes on using this list
- Each step's prompt is intentionally scoped to one package/concern — resist
  the urge to combine steps to save time, since the gates are what catch
  engine bugs before they propagate into AI/UI code built on top of them.
- Steps 1-4 (engine core) are where I'd genuinely slow down and not move to
  Step 5 until the property tests have run thousands of randomized games
  without a single invariant violation — this is the piece where a subtle
  bug is expensive to unwind six steps later.
- Steps 8-11 (AI) can be reordered relative to 12-13 (UI) if you want a
  playable-against-a-human milestone sooner — Step 7's debug UI already
  supports human-vs-human, so there's no hard dependency forcing AI before UI.
