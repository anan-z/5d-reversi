# packages/notation

**Status: not yet implemented.** Build via `docs/roadmap/build-steps.md`
Step 6.

Serializes/parses 5DRN (5D Reversi Notation) per
`docs/spec/dev-brief.md` §5:

```
(w,x,y,z)@Tn           # normal move
R(w,x,y,z)@Tk~Tn        # retro move at turn Tk, current turn Tn
```

Used by `packages/web` for game export and by the (not-yet-placed)
standalone analysis viewer app for import (roadmap Step 13, see
ADR-001 for why this replaced a live analysis server).
