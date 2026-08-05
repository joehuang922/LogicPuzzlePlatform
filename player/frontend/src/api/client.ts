const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// Statuses returned when Aurora is still resuming from a paused state or the
// gateway timed out waiting for it. These are transient and worth retrying.
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(
  path: string,
  options?: RequestInit,
  retries = 3
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
    } catch (networkErr) {
      // Network-level failure (DB waking, connection dropped). Retry.
      if (attempt >= retries) throw networkErr;
      await sleep(Math.min(1000 * 2 ** attempt, 6000));
      continue;
    }

    if (!res.ok) {
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        await sleep(Math.min(1000 * 2 ** attempt, 6000));
        continue;
      }
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
}

export interface Puzzle {
  id: string;
  puzzleType: number;
  puzzleTypeName: string;
  title: string | null;
  author: string | null;
  difficulty: number;
  width: number | null;
  height: number | null;
  canonRepr: Record<string, unknown>;
  srcCollection: number | null;
  srcCollectionName: string | null;
  srcCollectionCoverSrc: string | null;
}

export function listPuzzles(filters?: { puzzleType?: string; srcCollection?: number | "none"; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.puzzleType) params.set("puzzleType", filters.puzzleType);
  if (filters?.srcCollection != null) params.set("srcCollection", String(filters.srcCollection));
  if (filters?.limit != null) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return request<{ puzzles: Puzzle[] }>(`/puzzles${qs ? `?${qs}` : ""}`);
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

export function updatePuzzle(id: string, data: {
  title?: string | null;
  author?: string | null;
  difficulty?: number;
  canonRepr?: Record<string, unknown>;
  srcCollection?: number | null;
}) {
  return request<{ puzzle: Puzzle }>(`/puzzles/${id}`, {
    method: "PATCH",
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

export interface Attempt {
  id: string;
  createdAt: string;
  latestProgress: number;
  latestElapsedSeconds: number;
}

export interface Snapshot {
  id: string;
  attempt: string;
  currentAnswer: string;
  progress: number;
  elapsedSeconds: number;
  finished: boolean;
  createdAt: string;
}

export function createAttempt(data: {
  player: number;
  question: string;
  initialAnswer: Record<string, unknown>;
}) {
  return request<{ attemptId: string; snapshotId: string }>("/attempts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function listAttempts(player: number, question: string, opts?: { finished?: boolean }) {
  let url = `/attempts?player=${player}&question=${encodeURIComponent(question)}`;
  if (opts?.finished != null) url += `&finished=${opts.finished}`;
  return request<{ attempts: Attempt[] }>(url);
}

export function getSolvedQuestions(player: number, questionIds: string[]) {
  const url = `/attempts?player=${player}&questions=${questionIds.map(encodeURIComponent).join(",")}`;
  return request<{ solvedQuestions: string[]; attemptedQuestions: string[] }>(url);
}

export interface CollectionProgress {
  collectionId: number;
  total: number;
  solved: number;
}

export function getCollectionProgress(player: number, collectionIds: number[]) {
  const url = `/attempts?player=${player}&collectionProgress=${collectionIds.join(",")}`;
  return request<{ collectionProgress: CollectionProgress[] }>(url);
}

export function getAttemptSnapshot(attemptId: string) {
  return request<{ snapshot: Snapshot }>(`/attempts/${attemptId}/snapshot`);
}

export interface AchievementUnlock {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  unlockedAt: string;
}

export function saveSnapshot(
  attemptId: string,
  data: {
    currentAnswer: Record<string, unknown>;
    progress: number;
    elapsedSeconds: number;
    finished?: boolean;
  }
) {
  return request<{ snapshotId: string; newAchievements?: AchievementUnlock[] }>(`/attempts/${attemptId}/snapshot`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface SnapshotSummary {
  id: string;
  progress: number;
  elapsedSeconds: number;
  createdAt: string;
}

export function listSnapshots(attemptId: string) {
  return request<{ snapshots: SnapshotSummary[] }>(`/attempts/${attemptId}/snapshots`);
}

export function getSnapshotById(attemptId: string, snapshotId: string) {
  return request<{ snapshot: Snapshot }>(`/attempts/${attemptId}/snapshots?snapshotId=${encodeURIComponent(snapshotId)}`);
}

export interface ProfileQuestionStat {
  typeId: number;
  typeName: string;
  total: number;
  solved: number;
  tried: number;
}

export interface ProfileCollectionRow {
  collectionId: number;
  collectionName: string;
  typeId: number;
  typeName: string;
  total: number;
  solved: number;
}

export interface ProfileAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface ProfileResponse {
  player: { id: number; name: string };
  questionStats: ProfileQuestionStat[];
  collectionStats: ProfileCollectionRow[];
  achievements: ProfileAchievement[];
}

export function getProfile(player: number) {
  return request<ProfileResponse>(`/profile?player=${player}`);
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
