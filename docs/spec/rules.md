# 5D Reversi — Rules

Source: original design brief by Anan Zeevy (Jan 2026), CC BY 4.0.
Code implementations of this concept use the MIT License (see repo root
`LICENSE`) per the original author's stated intent, to keep the ruleset
concept open while permitting commercial use of the software.

## 1. Overview

5D Reversi extends classic Reversi/Othello into four spatial dimensions
plus one temporal dimension. Players place discs on a 4D hypercube board
and may, under strict limits, retroactively place a disc in their own past
turn, rewriting subsequent history via deterministic replay.

## 2. Components

- **Board:** 4×4×4×4 4D hypercube grid (N=4 standard).
- **Coordinates:** `(w, x, y, z)`, each from `0` to `N-1`.
- **Cell states:** `.` (empty), `B` (Black), `W` (White).

## 3. Timeline

The game proceeds through turns `T=1,2,3,...`. Each turn stores a full
snapshot of the board. The timeline is single and canonical. Retro moves
rewrite past snapshots and deterministically recompute all later turns.

## 4. Setup

### 4.1 General setup formula (any even-sized board)

Let the board size along each spatial axis be `N`, where `N` is even and
`N >= 4`. Coordinates along each axis range from `0` to `N-1`.

Define the central coordinate pair: `C = { N/2 - 1, N/2 }`.

The opening position occupies the 2×2×2×2 hypercube defined by
`w, x, y, z ∈ C`. This produces 16 initial discs.

Disc colors are assigned by parity:
- A disc at `(w, x, y, z)` is **Black** if `(w + x + y + z)` is even.
- A disc is **White** if `(w + x + y + z)` is odd.

This construction activates all four spatial dimensions, generalizes the
standard Reversi opening to arbitrary even-sized 4D boards, and preserves
full symmetry and fairness. Black moves first. Set `T = 1`.

### 4.2 Explicit coordinates for 4×4×4×4 (N = 4)

**Black discs (even parity):**
`(1,1,1,1) (1,1,2,2) (1,2,1,2) (1,2,2,1) (2,1,1,2) (2,1,2,1) (2,2,1,1) (2,2,2,2)`

**White discs (odd parity):**
`(1,1,1,2) (1,1,2,1) (1,2,1,1) (1,2,2,2) (2,1,1,1) (2,1,2,2) (2,2,1,2) (2,2,2,1)`

## 5. Lines and flipping rules

Valid lines are defined by direction vectors with components in
`{-1, 0, +1}`, excluding the zero vector. In 4D this yields 80 vectors, or
40 unique lines (bidirectional pairs count as one).

A placement is legal only if it flips at least one opponent disc. All
flips occur simultaneously.

## 6. Standard turn (present placement)

On your turn, place a disc on an empty cell in the current timeline.
Apply all flips, then advance the timeline by one turn. If no legal
placement exists, you may pass.

## 7. Retro turn (temporal placement)

Constraints:
- Only on your own past turns (same parity).
- Retro move happens **in addition**, after the original move of that
  turn — the player effectively played two moves on that turn, and the
  current turn is marked as a pass.
- Within the last 10 turns (may not target the setup turn).
- The target cell must be empty in the chosen past snapshot.
- Placement must cause at least one flip.
- Each player may perform at most one retro move per game (or once every
  five turns in variant play).

## 8. Deterministic forward replay

After a retro insertion, re-execute all subsequent turns using the
original move coordinates. If a replayed move is illegal (occupied cell
or zero flips), it is skipped (turn becomes a forced pass). Skipped moves
represent opportunities lost to the rewritten past.

## 9. Passing and game end

A player may pass only if they have no legal present move and cannot or
chooses not to perform a legal retro move. The game ends when both
players pass consecutively.

**Winner:** the player with the majority of discs in the final timeline.
**Tiebreaker:** White wins.

## 10. Optional variants

- **No-Retro Mode:** disables temporal moves.
- **Short-Memory Mode:** retro depth limit reduced to 5 turns.
- **Multi-Retro Mode:** multiple retro moves allowed (AI research only).

## 11. Design intent (non-normative)

Retrocausality is intended as a strategic correction tool rather than a
dominant tactic. Temporal manipulation carries real cost through skipped
future moves and strict limits.
