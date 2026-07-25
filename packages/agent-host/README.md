# packages/agent-host

**Status: not yet implemented.** Build via `docs/roadmap/build-steps.md`
Step 8a (referenced in `docs/architecture/decisions.md` ADR-005).

Implements `AgentHandle` from `packages/protocol/protocol.ts`: loads an
agent module (built-in or user-imported) into a sandboxed Web Worker,
drives the `init`/`requestMove` message round-trip, enforces
`MoveBudget.timeBudgetMs` via termination, and tracks consecutive-failure
forfeiture per `docs/protocol/playeragent-spec.md` §9.

This is the **only** package that knows agents exist — `packages/engine`
must stay agent-unaware (ADR-007).

Key constraints to implement against (see
`docs/protocol/playeragent-spec.md` §6-8 and
`docs/protocol/params-and-engine-placement.md` §3):
- CSP: `connect-src 'none'` on agent Workers, no DOM access
- Structured-clone-only messaging across the Worker boundary
- Read `navigator.hardwareConcurrency` once, pass into `InitContext` —
  never let sub-workers query it themselves
- `worker.terminate()` is not guaranteed to cascade to grandchild workers
  an agent spawned — track the full worker tree per agent if possible
