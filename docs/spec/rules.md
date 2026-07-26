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

**Made explicit (previously assumed, per external review feedback, July
2026):** for a given direction, a line of opponent discs is only capturable
if it consists of an **unbroken run of one or more opponent discs
immediately adjacent to the placed disc, terminated by one of the
player's own discs with no empty cell anywhere in between**. Hitting an
empty cell, or reaching the board edge, before reaching one of the
player's own discs means that direction contributes no flips. "All flips
occur simultaneously" means every direction's opponent-run is evaluated
against the board state **as it was immediately before this placement** —
flips from one direction never feed into or block the evaluation of
another direction within the same move.

## 6. Standard turn (present placement)

On your turn, place a disc on an empty cell in the current timeline.
Apply all flips, then advance the timeline by one turn. If no legal
placement exists, you may pass.

## 7. Retro turn (temporal placement)

Constraints:
- Only on your own past turns (same parity).
- Retro move happens **in addition**, after the original move of that
  turn — the player effectively played two moves on that turn, and the
  current turn is marked as a pass. The retro placement does not replace
  or remove the original move's disc; both are present on the board from
  that turn forward, and both participate normally in subsequent flips
  and replay.
- Within the last 10 turns (may not target the setup turn).
- The target cell must be empty in the chosen past snapshot. Since the
  snapshot at a given turn is taken *after* that turn's original
  placement, this rule already excludes retro-placing on the same cell
  as the original move of that turn — the original disc occupies it, so
  it is not empty. (Stated explicitly here since it's easy to read the
  additive-placement wording above as implying the two placements could
  coincide; they cannot, as a direct consequence of the empty-cell rule,
  not as a separate restriction.)
- Placement must cause at least one flip.
- Each player may perform at most one retro move per game under Standard
  Rules. See `MultiRetroRules` in Section 10 for the variant that
  permits repeated retro moves at a fixed cooldown instead.

**Retro quota and legality (clarifying an interaction not previously
spelled out):** "used their retro" refers strictly to having already
successfully performed one, not to whether one is currently *legal*. A
player who has not yet used their retro but has no legal retro move
available in the current 10-turn window (e.g., no own-parity past turn in
range still admits a legal placement) is in exactly the same position as
a player with no legal present move and no legal retro: per Section 9,
they must pass. Having an unused quota does not create an obligation or
a stuck state — "cannot... perform a legal retro move" in Section 9
covers both "already used it" and "one isn't legally available right
now."

## 8. Deterministic forward replay

After a retro insertion, re-execute all subsequent turns using the
original move coordinates. If a replayed move is illegal (occupied cell
or zero flips), it is skipped (turn becomes a forced pass). Skipped moves
represent opportunities lost to the rewritten past.

## 9. Passing and game end

A player may pass only if they have no legal present move and cannot or
chooses not to perform a legal retro move. The game ends when both
players pass consecutively.

**Forced passes count the same as voluntary passes for game-end purposes
(clarifying an unstated case):** a turn that becomes a forced pass as a
result of replay (Section 8) counts identically to a player's own
voluntary pass for the "two consecutive passes ends the game" rule. There
is no distinction between "the player chose to pass" and "replay forced
a pass" for this purpose — both are simply an empty turn in the canonical
move log. A cascade of several consecutive forced passes across both
players (however many turns it spans) ends the game exactly as two
voluntary passes would, using the same rule, not a special case.

**Winner:** the player with the majority of discs in the final timeline.
**Tiebreaker:** White wins. This asymmetric tiebreaker is an intentional,
formal part of the ruleset (not a placeholder) — ties are not draws under
Standard Rules.

## 10. Optional variants

- **No-Retro Mode:** disables temporal moves entirely.
- **Short-Memory Mode:** retro depth limit reduced to 5 turns (instead of
  the Standard Rules' 10-turn window); still one retro per player per
  game.
- **Multi-Retro Mode (AI research only):** removes the "one retro per
  game" cap. Instead, each player may perform a retro move at most **once
  every 5 turns** (measured from their own previous retro move, not the
  global turn counter) — this is the concrete quota definition for what
  was previously referenced only informally; there is no unlimited-retro
  variant. All other constraints from Section 7 (own-parity turns only,
  10-turn depth window, target cell empty, must cause a flip) still
  apply per retro attempt.

## 11. Design intent (non-normative)

Retrocausality is intended as a strategic correction tool rather than a
dominant tactic. Temporal manipulation carries real cost through skipped
future moves and strict limits.
