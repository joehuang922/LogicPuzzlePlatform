const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body.error) detail = body.error;
    } catch {}
    throw new Error(`API error ${res.status}: ${detail}`);
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

const PARSER_URL = import.meta.env.VITE_PARSER_URL ?? `${API_BASE}/parse`;

export async function parseImage(image: string, puzzleType: number) {
  const res = await fetch(PARSER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, puzzleType }),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body.error) detail = body.error;
    } catch {}
    throw new Error(`Parse error ${res.status}: ${detail}`);
  }
  return res.json() as Promise<{ canon: Record<string, unknown> }>;
}
