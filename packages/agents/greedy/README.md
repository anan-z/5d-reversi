# packages/agents/greedy

**Status: not yet implemented.** Build via `docs/roadmap/build-steps.md`
Step 8.

Reference `PlayerAgent` implementation: picks the legal move that flips
the most discs this turn, no lookahead. Declares `difficulty` and
`timeLimitMs` params per `docs/protocol/playeragent-spec.md` §3 as the
worked example of the declarative-params mechanism
(`docs/protocol/params-and-engine-placement.md` §1).
