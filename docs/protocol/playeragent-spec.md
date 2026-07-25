# 5D Reversi — PlayerAgent Spec (v0.1)
### "How to build an AI that plays 5D Reversi"

This document defines the contract that any player agent — built-in or
imported — must implement to compete in 5D Reversi. It is deliberately
modeled on engine-GUI protocols like UCI (chess): the game shell knows
nothing about how an agent decides moves, only how to ask it for one.

Status: draft, versioned independently from the game itself. Breaking
changes bump the major version and old agents should fail `describe()`
version negotiation loudly rather than silently misbehave.

---

## 1. Design principles

- **No privileged access.** An agent sees exactly what the read-only
  analysis API would show a human or external tool: canonical board state,
  legal moves, move history. Nothing more.
- **The agent is a black box.** The shell doesn't know or care if it's
  random-move code, minimax, a neural net, or a human pretending to be an
  AI. It only knows the message contract below.
- **The agent owns its own parallelism.** If you want to use all 128
  threads on a Threadripper, spawn your own worker pool inside your agent.
  The shell doesn't manage this for you (see §6).
- **Untrusted by default.** Your agent runs in a sandboxed Worker with no
  DOM access and no network access. Don't build an agent that assumes
  either will work.

---

## 2. File format

An agent is a single JavaScript file (ES module) that will be loaded into
a dedicated Worker. It must have no top-level side effects beyond
registering its handlers — the shell controls when your code actually runs.

```js
// my-agent.js
export const manifest = { /* see §3 */ };

export async function init(ctx) { /* see §4 */ }

export async function requestMove(state, budget) { /* see §5 */ }
```

That's the entire required surface. Everything else — your search
algorithm, evaluation function, opening book, whatever — is your own code,
imported normally via ES module imports (bundle it into one file, or use
relative imports if your build supports it; the shell just loads the
entry file as a module).

---

## 3. `manifest`

Declares who you are and what parameters your agent exposes. The shell
renders a settings form directly from this — you don't build any UI.

```ts
interface AgentManifest {
  name: string;              // "My Cool Engine"
  author: string;
  version: string;           // semver, your agent's version
  protocolVersion: "0.1";    // must match this spec's version
  description?: string;

  params: AgentParam[];
}

type AgentParam =
  | { key: string; label: string; type: "enum";
      options: string[]; default: string }
  | { key: string; label: string; type: "number";
      min: number; max: number; step?: number; default: number }
  | { key: string; label: string; type: "boolean"; default: boolean };
```

Example:

```js
export const manifest = {
  name: "GreedyBot",
  author: "you",
  version: "1.0.0",
  protocolVersion: "0.1",
  params: [
    { key: "difficulty", label: "Difficulty", type: "enum",
      options: ["Easy", "Medium", "Hard"], default: "Medium" },
    { key: "timeLimitMs", label: "Think time (ms)", type: "number",
      min: 500, max: 30000, step: 500, default: 5000 },
  ],
};
```

The built-in default AI's `difficulty` / `timeLimitMs` / (whatever else)
knobs discussed earlier are just an ordinary manifest — there is no special
case for "official" agents.

---

## 4. `init(ctx)`

Called once, before the game starts, with the resolved parameter values
(after the player has filled in your manifest-generated form) and static
game info.

```ts
interface InitContext {
  gameConfig: {
    dimensionCount: number;   // 4
    boardSize: number;        // 4, 6, or 8
    maxRetroDepth: number;
  };
  ruleset: {
    name: string;             // "standard" | "no-retro" | "short-memory" | ...
    retroEnabled: boolean;
    retroDepthLimit: number;
    retroMovesPerGame: number;
  };
  paramValues: Record<string, string | number | boolean>; // matches your manifest keys
  hardwareConcurrency: number; // read once by the shell, passed to you — see §6
  color: "B" | "W";
}
```

Use this to set up whatever persistent state you need (transposition
tables, opening book loading, worker pool creation). `init` has its own
time budget (shell-configured, generous — e.g. 5s) since it's off the
per-move clock.

---

## 5. `requestMove(state, budget)`

Called every time it's your turn. Must resolve with a move before `budget`
expires or you will be terminated (see §7).

```ts
interface MoveRequest {
  turnNumber: number;
  boardSnapshot: Int8Array;      // canonical current board, same layout as /board endpoint
  legalMoves: LegalMove[];       // pre-computed by the engine — you do not need to
                                  // (and cannot) validate legality yourself
  moveHistory: HistoryEntry[];   // full canonical move list, same shape as /moves endpoint
  retroAvailable: boolean;       // false if you've used your retro move(s) already
}

interface LegalMove {
  type: "normal";
  coord: [number, number, number, number];
} | {
  type: "retro";
  coord: [number, number, number, number];
  targetTurn: number;
}

interface Budget {
  timeBudgetMs: number;   // hard ceiling for this call
}

type AgentMove =
  | { type: "normal"; coord: [number, number, number, number] }
  | { type: "retro"; coord: [number, number, number, number]; targetTurn: number }
  | { type: "pass" };  // only legal if legalMoves is empty
```

**You must return a move from `legalMoves` (or `pass` if it's empty).**
The engine re-validates whatever you return regardless — an illegal return
is treated as a forfeited turn (auto-pass), not a crash, but you should
never rely on that path.

Minimal legal agent (random mover):

```js
export async function requestMove(state, budget) {
  if (state.legalMoves.length === 0) return { type: "pass" };
  const i = Math.floor(Math.random() * state.legalMoves.length);
  return state.legalMoves[i];
}
```

---

## 6. Parallelism

Your agent worker may spawn its own sub-workers to use additional cores —
this is your responsibility, not the shell's.

- `hardwareConcurrency` is given to you once in `init()`. **Do not query
  `navigator.hardwareConcurrency` yourself from inside sub-workers** — each
  one will report the same total core count, and naive recursive spawning
  based on that number will fork-bomb the tab. Divide it yourself if you
  spawn a tree of workers.
- Nested worker support varies by browser (solid in Chrome/Firefox, spotty
  in Safari). If your agent spawns sub-workers and none are available, fall
  back to single-threaded search rather than throwing.
- Independent-subtree parallelism (each sub-worker returns a candidate
  move+score, you pick the best) needs nothing special and is the
  recommended pattern.
- Shared-memory parallelism (e.g. a shared transposition table via
  `SharedArrayBuffer`) is possible but requires the host page to be served
  with COOP/COEP headers, which may or may not be true depending on
  deployment — don't assume it's available; feature-detect
  `typeof SharedArrayBuffer !== "undefined"` and degrade gracefully.
- All sub-workers you spawn inherit your sandbox restrictions (§8) and are
  your responsibility to terminate cleanly — see §7.

---

## 7. Timing and termination

- `requestMove` has a hard wall-clock budget (`budget.timeBudgetMs`,
  matching the game's configured time control — e.g. from the Easy/Medium/
  Hard/Nightmare/GCTM + thinking-time settings).
- If you don't resolve in time, the shell terminates your worker (and does
  its best to terminate any sub-workers you spawned — but see the caveat
  below) and records a forced pass for that turn.
- **Terminating a parent worker does not reliably kill grandchild workers
  in every browser.** Well-behaved agents should implement their own
  internal deadline check (e.g. stop searching at `budget.timeBudgetMs - 200ms`
  and message all sub-workers to stop) rather than relying solely on the
  shell's termination as a safety net. Treat the shell's terminate as a
  last resort, not your primary stopping mechanism.
- Iterative deepening is the recommended pattern precisely because it lets
  you always have a "best move so far" ready to return the moment your
  internal deadline hits, rather than getting hard-killed mid-search with
  nothing to show.

---

## 8. Sandbox constraints

Your agent runs in a Worker with:

- No DOM access (true of all Workers by default)
- `connect-src 'none'` — no `fetch`, no `XMLHttpRequest`, no WebSocket. Your
  agent cannot phone home, call an external API, or load remote resources
  at runtime. Bundle everything (weights, opening books, etc.) into the
  file at import time — i.e. embed data in the module itself.
- No access to `localStorage`/`indexedDB`/cookies of the host page
- Structured-clone-only messaging in and out — you cannot return live
  object references, functions, or DOM nodes across the boundary, only
  plain data

If your agent needs a large static dataset (opening book, trained
weights), embed it as a base64 string or typed-array literal in the module
rather than expecting to fetch it — this is a deliberate limitation, not
an oversight.

---

## 9. Errors

If `init` or `requestMove` throws or rejects:

- First occurrence: logged, turn is treated as `pass`, game continues.
- Repeated failures (shell-configured threshold, default 3 consecutive):
  agent is forfeited for the remainder of the game, opponent wins by
  forfeit. This prevents a broken import from producing an infinite
  pass-loop game that never ends.

---

## 10. Validation checklist (do this before submitting/sharing an agent)

- [ ] `manifest.protocolVersion` matches this spec's version
- [ ] Agent returns a move within budget on N=4, N=6, **and** N=8 boards —
      test all three, since board size dramatically changes search space
- [ ] Agent handles `legalMoves.length === 0` (must return `pass`)
- [ ] Agent handles `retroAvailable === false` (must not return a retro move)
- [ ] Agent survives being terminated mid-search across multiple games in a
      row without leaking workers (check the browser task manager / worker
      count doesn't creep up game over game)
- [ ] Agent has no top-level `fetch`/network calls (won't work anyway, but
      shouldn't throw trying)
- [ ] Run a 20+ game self-play match against `RandomAI` and `GreedyAI`
      (bundled reference agents, spec-compliant, useful as sanity-check
      opponents) to confirm basic competence before testing against
      stronger built-in tiers

---

## 11. Reference agents

Two minimal spec-compliant agents ship with the game shell and are useful
both as opponents and as implementation examples:

- **RandomAI** — picks uniformly from `legalMoves`. Useful as a lower
  sanity bound: anything you build should beat this consistently.
- **GreedyAI** — picks the legal move that flips the most discs this turn,
  no lookahead. Useful as a slightly-less-trivial sanity bound.

Both are implemented against this exact protocol (no special-cased
in-process shortcuts) — reading their source is the fastest way to see a
complete, working, minimal agent end-to-end.

---

## 12. Versioning

This is v0.1 — expect the shape of `MoveRequest`/`LegalMove` to stabilize
once retro-aware search (roadmap Step 10) surfaces any fields this draft
is missing. Treat `protocolVersion` in the manifest as a hard compatibility
gate, not a suggestion: the shell should refuse to load an agent whose
declared version it doesn't recognize, rather than guessing.
