# packages/protocol

**Status: spec'd and typechecked.** This is the contract, not an
implementation — no runtime logic lives here, only:

- `protocol.ts` — TypeScript types for the engine<->agent message contract
  (`MoveRequest`, `AgentMove`, `PlayerAgent`, `AgentHandle`, etc.)
- `manifest.schema.json` — JSON Schema for runtime-validating an imported
  agent's declared `manifest` before executing any of its code

See `docs/protocol/playeragent-spec.md` for the prose explanation of this
contract, and `docs/protocol/params-and-engine-placement.md` for how
declared agent parameters flow through the system end to end.

Both files here have been typechecked/validated against example agents
and manifests (see conversation history / commit notes) but are v0.1 —
expect refinement once `packages/engine` (Steps 1-5) and `packages/agent-host`
(Step 8a) are actually built against them.
