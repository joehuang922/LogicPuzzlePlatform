const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return null as T;
  return res.json();
}

export function listPuzzles(puzzleType?: string) {
  const params = puzzleType ? `?puzzleType=${puzzleType}` : "";
  return request<{ puzzles: unknown[] }>(`/puzzles${params}`);
}

export function getPuzzle(id: string) {
  return request<{ puzzle: unknown }>(`/puzzles/${id}`);
}

export function createPuzzle(data: {
  puzzleType: number;
  difficulty: number;
  canonRepr: Record<string, unknown>;
  title?: string;
  author?: string;
  width?: number;
  height?: number;
  srcCollection?: number;
}) {
  return request<{ id: string }>("/puzzles", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function deletePuzzle(id: string) {
  return request<null>(`/puzzles/${id}`, { method: "DELETE" });
}

export interface Collection {
  id: number;
  name: string;
  publisher: string | null;
  publishAt: string | null;
  coverSrc: string | null;
  puzzleCount: number;
}

export function listCollections() {
  return request<{ collections: Collection[] }>("/collections");
}

export function createCollection(data: {
  name: string;
  publisher?: string;
  publishAt?: string;
  coverSrc?: string;
}) {
  return request<{ id: number }>("/collections", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface PuzzleType {
  id: number;
  name: string;
  rule: string;
}

export function listPuzzleTypes() {
  return request<{ puzzleTypes: PuzzleType[] }>("/puzzle-types");
}

export function parseImage(image: string, puzzleType: number) {
  return request<{ canon: Record<string, unknown> }>("/parse", {
    method: "POST",
    body: JSON.stringify({ image, puzzleType }),
  });
}
