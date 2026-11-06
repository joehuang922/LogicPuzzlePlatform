import { ReactNode } from "react";

export interface PuzzleDefinition {
  id: string;
  puzzleType: number;
  puzzleTypeName: string;
  puzzleTypeJpLabel: string;
  title: string | null;
  author: string | null;
  difficulty: number;
  width: number | null;
  height: number | null;
  canonRepr: Record<string, unknown>;
  srcCollectionName: string | null;
  srcCollectionCoverSrc: string | null;
  // Auto-solve gate output (docs/auto-solve). Present for gated types; null otherwise.
  // solutionRepr backs the "reveal" hint fallback when no logical step is found.
  solutionRepr?: Record<string, unknown> | null;
  validationStatus?: "unique" | "multiple" | "none" | "unknown" | null;
}

export interface PuzzleState {
  puzzleId: string;
  playerGrid: Record<string, unknown>;
  /**
   * Exact board values to restore (undo/redo on the Play page), alongside
   * `playerGrid` (their saved answer). Only a renderer whose saved answer drops
   * state its board keeps (Nonogram crosses, LITS marks) needs to read it; every
   * other renderer restores losslessly from `playerGrid`.
   */
  restoreValues?: Record<string, number>;
  startedAt: string;
  lastUpdatedAt: string;
}

export interface PlayerAction {
  type: string;
  payload: unknown;
}

export interface AnswerExtractor {
  puzzleType: number;
  extract(puzzle: PuzzleDefinition, userValues: Record<string, number>): Record<string, unknown>;
}

export interface PuzzleRenderer {
  puzzleType: number;
  render(puzzle: PuzzleDefinition, state: PuzzleState, onValuesChange?: (values: Record<string, number>) => void, onComplete?: () => void, liveValidate?: boolean): ReactNode;
  handleInput(state: PuzzleState, action: PlayerAction): PuzzleState;
  checkSolution(state: PuzzleState, puzzle: PuzzleDefinition): boolean;
}
