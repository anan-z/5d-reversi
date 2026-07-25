# packages/notation

**Status: not yet implemented.** Build via `docs/roadmap/build-steps.md`
Step 6.

Serializes/parses 5DRN (5D Reversi Notation) per
`docs/spec/dev-brief.md` §5:

```
(w,x,y,z)@Tn           # normal move
R(w,x,y,z)@Tk~Tn        # retro move at turn Tk, current turn Tn
```

## More than serialization

5DRN is not just a save/load format — treat it with the same weight
chess treats PGN or Go treats SGF, since it ends up serving several
distinct roles for this project:

- **Replay format.** A whole game — including every retro insertion and
  the resulting forced passes — is a small text file, independent of any
  particular UI or engine version.
- **Debugging artifact.** Per ADR-010 (`docs/architecture/decisions.md`),
  a 5DRN log plus its expected final hash is exactly what a bug report or
  a CI regression fixture should look like: reproducible from nothing but
  the move list.
- **AI research / self-play data.** Any `PlayerAgent` (roadmap Step 8+)
  can log its own games as 5DRN for later analysis, opening-book
  construction, or training data, without needing engine internals.
- **Tournament format.** If agents ever compete against each other
  (round-robins, per the roadmap's AI-tier testing), 5DRN is the natural
  interchange format between the tournament runner and any external
  analysis tooling.
- **Reproducibility mechanism.** Combined with ADR-010's canonical hash,
  a 5DRN file plus a stated engine version should be sufficient for a
  second, independent implementation to arrive at bit-identical results —
  which is the actual bar for "the temporal rules are formally specified,"
  not just prose in `docs/spec/rules.md`.

Used by `packages/web` for game export and by the (not-yet-placed)
standalone analysis viewer app for import (roadmap Step 13, see
ADR-001 for why this replaced a live analysis server).
