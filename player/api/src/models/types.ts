export enum Difficulty {
  VeryEasy = 1,
  Easy = 2,
  Normal = 3,
  Hard = 4,
  SuperHard = 5,
}

export interface PuzzleType {
  id: number;
  name: string;
  rule: string;
}

export interface PuzzleCollection {
  id: number;
  name: string;
  publisher: string | null;
  publishAt: string | null;
  coverSrc: string | null;
}

export interface PuzzleQuestion {
  id: string;
  puzzleType: number;
  title: string | null;
  author: string | null;
  difficulty: number;
  width: number | null;
  height: number | null;
  canonRepr: Record<string, unknown>;
  srcCollection: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePuzzleRequest {
  puzzleType: number;
  title?: string;
  author?: string;
  difficulty: number;
  width?: number;
  height?: number;
  canonRepr: Record<string, unknown>;
  srcCollection?: number;
}

export interface ListPuzzlesQuery {
  puzzleType?: number;
  limit?: number;
  offset?: number;
}
