# 5D Reversi — Development & Marketing Brief

Source: original design brief by Anan Zeevy (Jan 2026), CC BY 4.0.
See `docs/architecture/decisions.md` for how this repo's actual
architecture diverges from or refines the brief below, and why.

## Game concept

- 4D spatial Reversi + temporal retrocausal moves.
- Players place discs on a 4D hypercube (256 cells at N=4), and can
  retroactively alter past moves.
- Deterministic forward replay recalculates history after retro moves.
- Interface: multiple 2D slice projections + timeline slider.

## 1. Engine & technical feasibility

| Component | Notes | Effort / complexity |
|---|---|---|
| Core Engine | 4D array board, legal move check, flip application, timeline storage, retro move replay | Simple (~300 lines in a tight implementation) |
| Retro Moves | Insert at T-k, replay all subsequent turns, skip illegal moves | Easy once engine is in place |
| Win Condition | Count discs at final turn | Trivial |
| AI Opponent | Minimax with 80-direction flip checking + temporal awareness | Major challenge for N=4; needs pruning, evaluation heuristics |
| UI | 16 mini 4×4 grids, axis view tabs, flip previews, paradox warnings, timeline slider | Moderate-high; requires careful state sync & rendering |

**Conclusion:** engine is trivial, AI & interface dominate development
time.

## 2. Multiplayer & networking

**Status in this repo: descoped for v1.** See ADR-001 in
`docs/architecture/decisions.md` — the project targets a static,
client-side-only deployment (GitHub Pages). Live networked multiplayer
and the local analysis HTTP/WebSocket server described in the original
API brief (`docs/spec/api-brief.md`) are optional future add-ons behind a
separate desktop-shell build, not part of the core game.

## 3. AI & difficulty levels

- **Easy:** restrict retro moves, fewer flips considered, limited search
  depth.
- **Medium:** standard rules, one retro per player, full N=4.
- **Hard:** multi-retro-aware AI, full 4D evaluation.
- **Nightmare / "Go Cry To Mama™":** iterative deepening, transposition
  tables, move ordering heuristics, configurable think time.

See `docs/protocol/playeragent-spec.md` for how difficulty and think-time
are actually implemented — as declarative agent parameters, not hardcoded
engine settings.

## 4. Tutorial & onboarding

- 40%+ of development effort likely goes here:
  - Gradual 4D flipping intuition.
  - Slice projection explanation.
  - Retro move demonstration.
- Must be interactive, visually clear, and paced to prevent early
  drop-off.
- This repo elevates the "explanation layer" (why is a move legal, what
  flips, why did replay invalidate turn N) to a first-class subsystem
  rather than UI polish — see ADR-003.

## 5. Notation & replay

Standardized notation:

```
(w,x,y,z)@Tn          # normal move
R(w,x,y,z)@Tk~Tn       # retro move at turn Tk, current turn Tn
```

Needed for competitive play, sharing replays, and AI research/self-play
logging. Implemented in `packages/notation`.

## 6. Monetization & business model

- Best fit: premium app (one-time purchase).
- Optional: cosmetic skins, AI hints, expansion packs (multi-retro /
  larger N).
- Ads unlikely to be tolerated by a niche strategy-game audience.

## 7. Marketing / community

- **Audience:** hardcore strategy gamers, puzzle/Go/board game
  enthusiasts, math nerds.
- **Launch strategy:** single-player / AI first; community building
  pre-launch (Discord, Reddit, video explainers); optional async
  multiplayer later.
- **Branding:** "5D Reversi: Permanent Brain Damage" — "The logic is
  elegant. The UI is a war crime."

**Bottom line:** engine-simple, interface-challenging,
community/marketing-dependent. Success depends heavily on AI
optimization, onboarding/tutorial design, and audience cultivation.
