export interface PuzzleQuestion {
  id: string;
  puzzleType: string;
  title: string | null;
  metadata: Record<string, unknown>;
  grid: Record<string, unknown>;
  constraints: Record<string, unknown>[] | null;
  solution: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePuzzleRequest {
  puzzleType: string;
  title?: string;
  metadata: Record<string, unknown>;
  grid: Record<string, unknown>;
  constraints?: Record<string, unknown>[];
  solution?: Record<string, unknown>;
}

export interface ListPuzzlesQuery {
  puzzleType?: string;
  limit?: number;
  offset?: number;
}
