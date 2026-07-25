# packages/web

**Status: not yet implemented.**

Two build targets sharing `packages/engine` + `packages/agent-host`:

- **Debug UI** (`docs/roadmap/build-steps.md` Step 7) — bare-bones,
  single-slice-plus-scrubber board view (see ADR-004 for why not a
  grid-of-N² boards), click-to-move, timeline slider.
- **Production UI** (Step 12) — built on the same `BoardSliceView`
  primitive as the debug UI, adds the explanation layer (ADR-003), flip
  previews, retro mode flow, and the player-setup screen
  (Human / Default AI / Import..., per
  `docs/protocol/playeragent-spec.md`) whose AI-settings form is
  auto-rendered from an agent's declared `manifest.params`
  (`docs/protocol/params-and-engine-placement.md` §1).
