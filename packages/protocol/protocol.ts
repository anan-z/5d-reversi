/**
 * 5D Reversi — PlayerAgent Protocol Types (v0.1)
 *
 * This is the single source of truth for the engine<->agent contract.
 * Both packages/engine (the shell that calls agents) and any agent
 * (built-in or imported) import these types — never duplicate them.
 *
 * Companion to manifest.schema.json, which is the *runtime-validatable*
 * declarative form of AgentManifest below (JSON Schema can't express
 * TypeScript unions as cleanly, so the manifest ships as both: this file
 * for compile-time agent authoring, the JSON Schema for the shell to
 * validate an unknown imported manifest before trusting it).
 */

// ---------------------------------------------------------------------------
// Coordinates and moves
// ---------------------------------------------------------------------------

/** A cell coordinate in the 4D board: [w, x, y, z], each 0..N-1. */
export type Coord4 = [number, number, number, number];

export type Color = "B" | "W";

export type LegalMove =
  | { type: "normal"; coord: Coord4 }
  | { type: "retro"; coord: Coord4; targetTurn: number };

export type AgentMove =
  | { type: "normal"; coord: Coord4 }
  | { type: "retro"; coord: Coord4; targetTurn: number }
  | { type: "pass" };

// ---------------------------------------------------------------------------
// History (mirrors the /moves API shape from the engine's debug API)
// ---------------------------------------------------------------------------

export type HistoryEntry =
  | { turn: number; player: Color; type: "normal"; coord: Coord4 }
  | { turn: number; player: Color; type: "retro"; coord: Coord4; targetTurn: number }
  | {
      turn: number;
      player: Color;
      type: "forced_pass";
      reason: "retro_cascade" | "no_legal_move";
      originalType?: "normal" | "retro";
      originalCoord?: Coord4;
    };

// ---------------------------------------------------------------------------
// Manifest — the declarative part (see manifest.schema.json for the
// runtime-validated JSON form of this same shape)
// ---------------------------------------------------------------------------

export type AgentParam =
  | { key: string; label: string; type: "enum"; options: string[]; default: string }
  | { key: string; label: string; type: "number"; min: number; max: number; step?: number; default: number }
  | { key: string; label: string; type: "boolean"; default: boolean };

export interface AgentManifest {
  name: string;
  author: string;
  version: string; // agent's own semver
  protocolVersion: "0.1";
  description?: string;
  params: AgentParam[];
}

export type ParamValues = Record<string, string | number | boolean>;

// ---------------------------------------------------------------------------
// init()
// ---------------------------------------------------------------------------

export interface GameConfig {
  dimensionCount: number; // 4
  boardSize: number; // 4 | 6 | 8
  maxRetroDepth: number;
}

export interface RulesetInfo {
  name: "standard" | "no-retro" | "short-memory" | "multi-retro" | string;
  retroEnabled: boolean;
  retroDepthLimit: number;
  retroMovesPerGame: number;
}

export interface InitContext {
  gameConfig: GameConfig;
  ruleset: RulesetInfo;
  paramValues: ParamValues;
  /**
   * Read once by the shell via navigator.hardwareConcurrency and handed to
   * you here. Do NOT re-query navigator.hardwareConcurrency from inside
   * sub-workers you spawn — divide this number yourself, or every
   * sub-worker will see the full core count and over-spawn.
   */
  hardwareConcurrency: number;
  color: Color;
}

// ---------------------------------------------------------------------------
// requestMove()
// ---------------------------------------------------------------------------

export interface MoveRequest {
  turnNumber: number;
  /**
   * Canonical board state, flat Int8Array, cells ordered lexicographically
   * by (w, x, y, z) with z varying fastest — identical layout to the
   * engine's /board endpoint. 0 = empty, 1 = Black, -1 = White (engine's
   * canonical encoding; agents should treat these as opaque constants
   * exported from the engine package, not hardcode the mapping).
   */
  boardSnapshot: Int8Array;
  legalMoves: LegalMove[];
  moveHistory: HistoryEntry[];
  retroAvailable: boolean;
}

export interface MoveBudget {
  /** Hard wall-clock ceiling in milliseconds for this requestMove() call. */
  timeBudgetMs: number;
}

// ---------------------------------------------------------------------------
// The agent module surface — what an agent's entry file must export
// ---------------------------------------------------------------------------

export interface PlayerAgent {
  manifest: AgentManifest;
  init(ctx: InitContext): Promise<void>;
  requestMove(state: MoveRequest, budget: MoveBudget): Promise<AgentMove>;
}

// ---------------------------------------------------------------------------
// Engine-side: what the shell uses to actually drive an agent
// ---------------------------------------------------------------------------

/**
 * The engine/shell side of the contract. This is NOT implemented by agent
 * authors — it's the host-side interface that wraps a sandboxed Worker
 * running an agent module and exposes it to the game loop uniformly,
 * whether the agent is the bundled default AI or an imported file.
 */
export interface AgentHandle {
  readonly manifest: AgentManifest;

  init(ctx: InitContext): Promise<void>;

  /**
   * Requests a move, enforcing budget.timeBudgetMs as a hard ceiling.
   * Resolves with the agent's move, or with { type: "pass" } plus
   * terminated: true if the agent blew its budget or threw and was killed.
   * Never rejects — engine-facing failure is always a valid, playable result.
   */
  requestMove(state: MoveRequest, budget: MoveBudget): Promise<{
    move: AgentMove;
    terminated: boolean;
    elapsedMs: number;
  }>;

  /** Tears down the agent's worker (and, best-effort, any sub-workers it spawned). */
  dispose(): Promise<void>;
}

/** Bumped on any breaking change to the message shapes above. */
export const PROTOCOL_VERSION = "0.1" as const;
