import { ReactNode } from "react";

export interface PuzzleMetadata {
  title?: string;
  source?: string;
  difficulty?: string;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

export interface PuzzleDefinition {
  id: string;
  puzzleType: string;
  title: string | null;
  metadata: PuzzleMetadata;
  grid: Record<string, unknown>;
  constraints: Record<string, unknown>[] | null;
}

export interface PuzzleState {
  puzzleId: string;
  playerGrid: Record<string, unknown>;
  startedAt: string;
  lastUpdatedAt: string;
}

export interface PlayerAction {
  type: string;
  payload: unknown;
}

export interface PuzzleRenderer {
  puzzleType: string;
  render(puzzle: PuzzleDefinition, state: PuzzleState): ReactNode;
  handleInput(state: PuzzleState, action: PlayerAction): PuzzleState;
  checkSolution(state: PuzzleState, puzzle: PuzzleDefinition): boolean;
}
