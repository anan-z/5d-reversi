# 5D Reversi — PlayerAgent: Params, Engine Placement, and Limitations

Companion doc to `protocol.ts` and `manifest.schema.json`. Those two files
are the contract; this doc explains *how the pieces fit together* — where
the declared params actually flow to, where the engine code that drives
all this actually lives in the repo, and what an agent author can and
can't rely on (in JS today, and in other languages/runtimes later).

---

## 1. How declared params actually flow through the system

The params array isn't just documentation — it's the entire mechanism by
which an agent's settings get from "author wrote it" to "player configured
it" to "agent receives it." Four steps:

```
1. Agent declares          2. Shell validates          3. Shell renders a         4. Resolved values
   manifest.params             manifest against            form from params           passed into
   (in the agent file)         manifest.schema.json        (dropdown for enum,        init(ctx) as
                                before running any          slider/input for           ctx.paramValues
                                agent code                  number, checkbox for
                                                             boolean)
```

Concretely, for the `difficulty` + `timeLimitMs` example:

- The agent's module exports `manifest.params` with those two entries.
- The shell runs `manifest.schema.json` against the whole manifest object
  (via any standard JSON Schema validator — e.g. Ajv) *before* it ever
  executes `init()` or `requestMove()` from that file. This is the gate
  that catches a malformed import early, with a readable error, instead of
  the game crashing mid-match on a bad param shape.
- The shell auto-generates the settings screen: one form control per
  param, using `type` to decide the widget and `label` as the visible
  text. No agent-specific UI code is written anywhere in the shell — this
  is what makes "import a file with a `quantumFluctuations` slider we've
  never heard of" work without a code change.
- When the player starts the game, the shell collects whatever values were
  set (or the `default`s if untouched) into a single `Record<string,
  string|number|boolean>` and passes it as `InitContext.paramValues`. The
  agent reads its own keys back out (`paramValues.difficulty`,
  `paramValues.timeLimitMs`, `paramValues.quantumFluctuations`, etc.) — the
  shell never interprets what the values *mean*, only their shape.

**This means the params array is the entire settings UI.** There is no
separate agent-settings-screen code to write per agent, built-in or
imported — the default AI (`GreedyBot`, the future minimax tiers) declares
its knobs exactly the same way an imported file would, which is the same
"no privileged access, one code path" principle from the sandboxing
design.

**The `timeLimitMs`-vs-`MoveBudget` overlap, resolved:** per the open
question from last time, I'd make the declared `timeLimitMs` param the
value the *shell* reads to set `MoveBudget.timeBudgetMs` for that agent's
moves — i.e. the shell doesn't have its own separate global time control
that ignores the agent's declared param. If an agent declares a
`timeLimitMs` param, the shell treats that key specially (by convention,
not by protocol enforcement) as the source of the per-move budget it will
enforce. An agent that *doesn't* declare a `timeLimitMs` param falls back
to a shell-wide default. This keeps a single number as the source of
truth instead of two numbers that can silently disagree.

---

## 2. Where the engine code lives

Referencing the monorepo layout from the build roadmap:

```
packages/
  engine/          <- pure game rules: board, legality, flips, timeline,
                      retro/replay, rulesets. NO knowledge of agents at all.
                      This is Steps 1-5 of the roadmap.

  protocol/         <- protocol.ts + manifest.schema.json live here.
                      Depended on by BOTH engine (agent-hosting code) and
                      by any agent (built-in or imported) that wants
                      compile-time types. This is a leaf package with no
                      dependencies of its own.

  agent-host/       <- NEW package, not yet in the roadmap by this name.
                      Implements AgentHandle from protocol.ts: creates the
                      sandboxed Worker, loads an agent module into it,
                      handles the init/requestMove message round-trip,
                      enforces MoveBudget via termination, tracks
                      consecutive-failure forfeiture (spec §9). This is
                      "Step 8a" from our last conversation, formalized.

  agents/
    random/         <- reference agent, built against protocol.ts, runs
    greedy/            through agent-host exactly like an import would.

  web/              <- React UI. Imports engine + agent-host as libraries.
                      Renders the params-driven settings form (§1 above)
                      using manifest.params + manifest.schema.json.
```

**The key structural point:** `engine/` never imports `protocol/` or
`agent-host/`. The rules engine has no idea agents exist — it just answers
"what are the legal moves" and "apply this move" for whoever's driving it,
human or agent. `agent-host/` is the layer that sits *between* the engine
and a player, translating engine state into `MoveRequest` objects and
agent responses back into engine calls. This is what makes "human, default
AI, or imported AI" genuinely interchangeable from the engine's point of
view — the engine only ever sees moves arrive, never who or what produced
them.

`web/` is the only package that knows about *rendering* — both the board
UI and the agent-settings-form-from-params UI described in §1.

---

## 3. Limitations

### 3.1 JavaScript (v1 target)

This is what `protocol.ts` and the sandboxing discussion from earlier
assume. Concrete limitations, restated as a checklist for agent authors:

- **No network.** `connect-src 'none'` on the Worker's CSP. No `fetch`,
  `XMLHttpRequest`, `WebSocket`, `EventSource`. An opening book or trained
  weights must be embedded in the module file itself (base64 string,
  typed-array literal, etc.) at author time — there is no "load this from
  a URL at runtime" path.
- **No DOM / no window.** Standard Worker restriction — no `document`,
  no direct rendering. Not a real limitation for a move-generating agent,
  but rules out an agent that wants to, say, render its own debug overlay
  directly (it would need to message data back for the shell to render,
  which the protocol doesn't currently carry — see §4).
- **No persistent storage.** No `localStorage`, `indexedDB`, or cookies
  scoped to the host page. Anything an agent wants to persist across games
  (e.g. a learned evaluation table) needs to either stay in-memory for the
  session or be embedded as static data — there's no sanctioned
  "agent saves progress" path in v0.1.
- **Structured-clone-only messaging.** No live object references,
  closures, or class instances cross the Worker boundary — only plain
  data (numbers, strings, arrays, plain objects, typed arrays). An
  agent's internal representation can be anything; what it returns from
  `requestMove` must be a plain `AgentMove` object.
- **Nested-worker support is inconsistent.** Solid in Chrome/Firefox,
  historically unreliable in Safari. An agent that spawns its own
  sub-worker pool for parallel search must feature-detect and fall back to
  single-threaded search rather than assuming nested workers exist.
- **`SharedArrayBuffer` isn't guaranteed available.** Requires COOP/COEP
  headers on the host page, which depend on deployment (the GitHub Pages
  service-worker-shim workaround from earlier gets you this, but it's not
  automatic). Feature-detect before relying on shared-memory parallelism;
  independent-subtree parallelism (workers return separate results, parent
  picks the best) needs none of this and always works.
- **Termination isn't instant or fully cascading.** `worker.terminate()`
  on a timed-out agent may not reliably kill grandchild workers it spawned
  in every browser. Well-behaved agents should self-enforce their deadline
  internally (stop searching with a safety margin, e.g.
  `timeBudgetMs - 200ms`) rather than relying on the shell's termination
  as the primary stopping mechanism.
- **Language ceiling is JS/TS (or anything that compiles to JS).** This
  is the actual "and others?" answer for v0.1: nothing stops an author
  from writing an agent in a language that *compiles to* JavaScript
  (TypeScript obviously, but also e.g. ReScript, or hand-rolled output
  from other toolchains) — the shell only ever sees the resulting `.js`
  module and doesn't know or care what produced it.

### 3.2 Other languages — not in v0.1, here's the actual path

Two genuinely different routes exist if you want non-JS agents later,
and they have different tradeoffs:

**WASM, no host-imported functions (the "verified" tier).** A pure
compute module — `(board_bytes, params) -> move_bytes` — compiled from
Rust, C, C++, AssemblyScript, or Zig, with zero imported host functions,
is by construction unable to touch the network, DOM, or filesystem: the
sandboxing isn't a CSP policy you hope holds, it's a structural guarantee
of what the module can even link against. This is strictly *more* secure
than the JS path, at the cost of authors needing a compiler toolchain
instead of just writing a `.js` file. I'd treat this as the natural v2:
`agent-host` would gain a second loader (`loadWasmAgent` alongside
`loadJsAgent`), both implementing the same `AgentHandle` interface from
`protocol.ts` — the engine and UI wouldn't need to know the difference.
The manifest/params mechanism from §1 works identically either way, since
it's just declarative JSON either way.

**Python, via Pyodide (CPython-compiled-to-WASM) or similar.** Technically
possible — Pyodide runs inside a Worker fine — but meaningfully heavier
(multi-MB runtime download, slower cold-start, slower per-move execution
than native JS or WASM) and I wouldn't prioritize it unless there's
specific demand for it; it doesn't add sandboxing benefits over the JS
path, just author convenience for people who prefer Python.

**Not planned: arbitrary native binaries / subprocess execution.**
Nothing in a browser context permits running a native `.exe`/ELF binary as
a player agent, and that's not a gap to fill — it would require leaving
the browser sandbox model entirely (the Tauri/Electron "optional local
server" shell mentioned earlier would be the only place this could ever
make sense, and even then I'd want it opt-in and clearly separated from
the default browser-only experience).

---

## 4. Known gap for later

The protocol as specified lets an agent return a move and nothing else.
Some agents (especially ones people build for fun, e.g. showing their
search process) may want to return auxiliary debug/commentary data —
"I considered move X because Y" — for the UI to display. `protocol.ts`
doesn't currently carry a channel for this. If that's something you'd
want (it pairs naturally with the explanation-layer feature from the
roadmap), it'd be a `MoveRequest`/`AgentMove` extension worth designing
deliberately rather than bolting on — flagging it now so it doesn't get
lost.
