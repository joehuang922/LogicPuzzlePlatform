import { ReactNode } from "react";

export interface PuzzleDefinition {
  id: string;
  puzzleType: number;
  puzzleTypeName: string;
  title: string | null;
  author: string | null;
  difficulty: number;
  width: number | null;
  height: number | null;
  canonRepr: Record<string, unknown>;
  srcCollectionName: string | null;
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
  puzzleType: number;
  render(puzzle: PuzzleDefinition, state: PuzzleState): ReactNode;
  handleInput(state: PuzzleState, action: PlayerAction): PuzzleState;
  checkSolution(state: PuzzleState, puzzle: PuzzleDefinition): boolean;
}
