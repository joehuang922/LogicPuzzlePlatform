const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

// Statuses returned when Aurora is still resuming from a paused state or the
// gateway timed out waiting for it. These are transient and worth retrying.
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A non-2xx API response. `code` is the API's machine-readable error code when it
// sent one (e.g. GATE_UNKNOWN_CODE).
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

// 400 code for a puzzle the solver gate timed out on; resubmitting with
// allowUnverified registers it anyway (as "unknown", so it stays flagged for review).
export const GATE_UNKNOWN_CODE = "gate_unknown";

export function isGateTimeout(err: unknown): boolean {
  return err instanceof ApiError && err.code === GATE_UNKNOWN_CODE;
}

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
      let code: string | undefined;
      try {
        const body = await res.json();
        if (body.error) detail = body.error;
        if (typeof body.code === "string") code = body.code;
      } catch {}
      throw new ApiError(`API error ${res.status}: ${detail}`, res.status, code);
    }
    if (res.status === 204) return null as T;
    return res.json();
  }
}

export interface Puzzle {
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
  srcCollection: number | null;
  srcCollectionName: string | null;
  srcCollectionCoverSrc: string | null;
  // MySQL BOOLEAN comes back over the Data API as 0/1.
  special: boolean | number;
  // Auto-solve registration gate verdict (docs/auto-solve). "unknown" = the gate's search
  // budget ran out before it could prove uniqueness (likely a mis-parse). Null for types
  // with no registered solver, or puzzles created before the gate / backfill.
  validationStatus?: "unique" | "multiple" | "none" | "unknown" | null;
}

export function listPuzzles(filters?: {
  puzzleType?: string;
  srcCollection?: number | "none";
  limit?: number;
  // "flagged" restricts to puzzles the gate could not uniquely solve
  // (validation_status IN ('multiple','none','unknown')) — the editorial review set.
  validation?: "flagged";
  // "recent": only puzzles someone has attempted, most recently played first.
  played?: "recent";
}) {
  const params = new URLSearchParams();
  if (filters?.puzzleType) params.set("puzzleType", filters.puzzleType);
  if (filters?.srcCollection != null) params.set("srcCollection", String(filters.srcCollection));
  if (filters?.limit != null) params.set("limit", String(filters.limit));
  if (filters?.validation) params.set("validation", filters.validation);
  if (filters?.played) params.set("played", filters.played);
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
  special?: boolean;
  allowUnverified?: boolean;
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
  special?: boolean;
  allowUnverified?: boolean;
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
  // Closed to new puzzles: hidden from every create / move-to picker. Set by the admin edit only.
  sealed?: boolean;
}

/**
 * The collections a puzzle may be created in or moved to: every unsealed one.
 * [keepId] (a puzzle's current collection) stays listed even when sealed, so a
 * picker can still show where the puzzle is.
 */
export function creationTargets(collections: Collection[], keepId?: number | null): Collection[] {
  return collections.filter((c) => !c.sealed || c.id === keepId);
}

// Ascending, case-insensitive, missing values last. publishAt is an ISO date, so
// comparing it as text orders it chronologically.
function compareNullsLast(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

/**
 * The order every collection list shows (Home, admin pickers and browser):
 * publisher, then name, then newest publish date first.
 */
export function sortCollections(collections: Collection[]): Collection[] {
  return [...collections].sort((a, b) =>
    compareNullsLast(a.publisher, b.publisher) ||
    compareNullsLast(a.name, b.name) ||
    (a.publishAt && b.publishAt ? b.publishAt.localeCompare(a.publishAt) : compareNullsLast(a.publishAt, b.publishAt))
  );
}

export function listCollections() {
  // uncollectedCount: puzzles with no collection (Home shows them as collection 0).
  return request<{ collections: Collection[]; uncollectedCount?: number }>("/collections");
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

/** Admin edit: a field left out is kept, an empty optional one is cleared. */
export function updateCollection(
  id: number,
  data: {
    name?: string;
    publisher?: string | null;
    publishAt?: string | null;
    coverSrc?: string | null;
    sealed?: boolean;
  }
) {
  return request<{ collection: Collection }>(`/collections/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/**
 * Uploads an image to the assets namespace and returns its stable public
 * (CloudFront) URL. Asks the API for a presigned PUT URL, then uploads the
 * file straight to S3 so large binaries never pass through API Gateway.
 */
export async function uploadImage(file: File): Promise<string> {
  const { uploadUrl, publicUrl } = await request<{
    uploadUrl: string;
    publicUrl: string;
  }>("/assets/upload-url", {
    method: "POST",
    body: JSON.stringify({ contentType: file.type }),
  });

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (${putRes.status})`);
  }

  return publicUrl;
}

export interface PuzzleType {
  id: number;
  name: string;
  jpLabel: string;
  rule: string;
  /** Live puzzles of this type. */
  puzzleCount?: number;
  /**
   * Experimental, reader-invented type from a single magazine appearance (few puzzles,
   * not published periodically). Listed after every other type.
   */
  incubating?: boolean;
}

/** Type order for every list and dropdown: regular types by id, then incubating ones by id. */
export function comparePuzzleTypes(a: PuzzleType, b: PuzzleType): number {
  return Number(!!a.incubating) - Number(!!b.incubating) || a.id - b.id;
}

export function sortPuzzleTypes(types: PuzzleType[]): PuzzleType[] {
  return [...types].sort(comparePuzzleTypes);
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

// Ids go in the query string; API Gateway's edge rejects URLs past ~8 KB with
// a 414, which 233 sudoku UUIDs already exceed. 100 ids keep a URL under 4 KB.
const SOLVED_QUESTIONS_BATCH = 100;

export async function getSolvedQuestions(player: number, questionIds: string[]) {
  const batches: string[][] = [];
  for (let i = 0; i < questionIds.length; i += SOLVED_QUESTIONS_BATCH) {
    batches.push(questionIds.slice(i, i + SOLVED_QUESTIONS_BATCH));
  }
  const results = await Promise.all(
    batches.map((ids) =>
      request<{ solvedQuestions: string[]; attemptedQuestions: string[] }>(
        `/attempts?player=${player}&questions=${ids.map(encodeURIComponent).join(",")}`
      )
    )
  );
  return {
    solvedQuestions: results.flatMap((r) => r.solvedQuestions),
    attemptedQuestions: results.flatMap((r) => r.attemptedQuestions ?? []),
  };
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
  typeJpLabel: string;
  total: number;
  solved: number;
  tried: number;
}

export interface ProfileCollectionRow {
  collectionId: number;
  collectionName: string;
  typeId: number;
  typeName: string;
  typeJpLabel: string;
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

export interface HistoryResponse {
  from: string;
  to: string;
  tz: string;
  metric: string;
  /** date (YYYY-MM-DD in tz) -> puzzle type id -> solves; idle days absent. */
  days: Record<string, Record<string, number>>;
}

export function getHistory(player: number, from: string, to: string, tz: string) {
  const q = new URLSearchParams({ player: String(player), from, to, tz, metric: "solved" });
  return request<HistoryResponse>(`/history?${q}`);
}

export type MissionPeriod = "day" | "week" | "month";

export interface Mission {
  id: number;
  period: MissionPeriod;
  slot: number;
  periodStart: string;
  startsAt: string;
  endsAt: string;
  kind: string;
  typeId: number | null;
  description: string;
  /** Assigned-puzzle missions only: the puzzle to open, its title and size pill. */
  questionId: string | null;
  questionTitle: string | null;
  size: "BIG" | "GIANT" | null;
  progress: number;
  target: number;
  /** Assigned-puzzle missions only: progress on the puzzle (0..1) from its latest snapshot. */
  puzzleProgress?: number | null;
  completed: boolean;
  completedAt: string | null;
  /** This mission was refreshed (the period's one refresh). */
  refreshed?: boolean;
  /** Changeable (a type or an assigned puzzle), open, and the period's refresh unused. */
  refreshable?: boolean;
  /** XP the mission earns. */
  xp: number;
}

/** Missions of the current periods, and the XP for completing all of a period's. */
export interface MissionsResponse {
  missions: Mission[];
  setBonusXp: Record<MissionPeriod, number>;
}

/** Current day/week/month missions; the API generates any missing one. */
export function getMissions(player: number) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  return request<MissionsResponse>(
    `/profile/missions?player=${player}&tz=${encodeURIComponent(tz)}`
  );
}

/** Swap one mission for another (once per period); answers with the current missions. */
export function refreshMission(player: number, missionId: number) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  return request<MissionsResponse>("/profile/missions/refresh", {
    method: "POST",
    body: JSON.stringify({ player, missionId, tz }),
  });
}

/** A level on the XP curve: total XP where it started and where the next begins. */
export interface LevelProgress {
  level: number;
  levelStartXp: number;
  nextLevelXp: number;
}

export interface TypeMastery extends LevelProgress {
  typeId: number;
  label: string;
  xp: number;
  solved: number;
}

export interface PlayerXp extends LevelProgress {
  total: number;
  fromSolves: number;
  fromMissions: number;
  fromSetBonuses: number;
  /** Types with at least one solve, most XP first. */
  mastery: TypeMastery[];
}

/** Total XP, overall level and per-type mastery, counted from solves and missions. */
export function getXp(player: number) {
  return request<PlayerXp>(`/profile/xp?player=${player}`);
}

const PARSER_URL = import.meta.env.VITE_PARSER_URL ?? `${API_BASE}/parse`;

// The deployed parser Lambda gives up after 2 minutes, so waiting longer is
// pointless. VITE_PARSER_URL means the local parser (`make author-ui`), which
// exists to parse boards too large for that limit: no client deadline there.
const PARSE_TIMEOUT_MS: number | null = import.meta.env.VITE_PARSER_URL
  ? null
  : 120_000;

export interface ParseImageResponse {
  canon: Record<string, unknown>;
  /**
   * Best-effort title/author/difficulty (1..5) read from around the board; absent
   * on older parsers.
   */
  metadata?: { title: string | null; author: string | null; difficulty?: number | null };
}

export async function parseImage(image: string, puzzleType: number) {
  let res: Response;
  try {
    res = await fetch(PARSER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, puzzleType }),
      signal:
        PARSE_TIMEOUT_MS === null ? undefined : AbortSignal.timeout(PARSE_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Parsing timed out (2min). Cold start may take a while — try again.");
    }
    throw err;
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body.error) detail = body.error;
    } catch {}
    throw new Error(`Parse error ${res.status}: ${detail}`);
  }
  return res.json() as Promise<ParseImageResponse>;
}

/** One clue line of a big-nonogram strip, by board-order index within the strip. */
export interface StripLineReading {
  index: number;
  clues: number[];
  /** Both separators traced across the whole clue grid (a cut line is not). */
  complete: boolean;
  /** gap | detached | no_clue | ghost_dropped:N | uncertain:i,j (clue positions) | ... */
  flags: string[];
  /** Cell boxes [x1, y1, x2, y2] in the uploaded image, in clue order. */
  boxes: number[][];
  /** [clue position, value]: what the other crop read where the two disagreed. */
  alternates?: [number, number][];
}

export interface StripReadingResponse {
  orientation: "rows" | "cols";
  lineCount: number;
  /** The strip shows the board's border before its first line / after its last. */
  startBorder: boolean;
  endBorder: boolean;
  /** Per separator (lineCount + 1): thick (every 5th) or not. */
  thick: boolean[];
  imageWidth: number;
  imageHeight: number;
  lines: StripLineReading[];
}

/** The parser runs locally (`make author-ui`): no deadline, no need to split work. */
export const PARSER_IS_LOCAL = Boolean(import.meta.env.VITE_PARSER_URL);

/**
 * Read share `chunk` of `chunks` of one big-nonogram clue strip. Every share
 * returns the strip's geometry; `lines` holds only that share's lines. With
 * orientation "auto" the parser picks the way round that finds more clue
 * lines (every share alike) and reports it; 422 then means no strip either way.
 */
export async function parseNonogramStrip(
  image: string,
  orientation: "rows" | "cols" | "auto",
  maxClue: number,
  chunk = 0,
  chunks = 1,
  /** With "auto": the largest clue either way (board width for rows, height for columns). */
  maxClues?: { rows: number; cols: number },
): Promise<StripReadingResponse> {
  let res: Response;
  try {
    res = await fetch(PARSER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "nonogramStrip", image, orientation, maxClue, chunk, chunks,
        ...(maxClues ? { maxClueRows: maxClues.rows, maxClueCols: maxClues.cols } : {}),
      }),
      signal: PARSE_TIMEOUT_MS === null ? undefined : AbortSignal.timeout(PARSE_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Reading timed out (2min).");
    }
    throw err;
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body.error) detail = body.error;
    } catch {}
    const err = new Error(`Strip error ${res.status}: ${detail}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<StripReadingResponse>;
}

export type PuzzleHeader = NonNullable<ParseImageResponse["metadata"]>;

/**
 * Title / author / difficulty (1..5) from a scan of a puzzle's header alone,
 * for boards too big for one scan (the big-nonogram strip editor). Any may be null.
 */
export async function parsePuzzleHeader(image: string): Promise<PuzzleHeader> {
  let res: Response;
  try {
    res = await fetch(PARSER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "puzzleHeader", image }),
      signal: PARSE_TIMEOUT_MS === null ? undefined : AbortSignal.timeout(PARSE_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error("Reading timed out (2min).");
    }
    throw err;
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body.error) detail = body.error;
    } catch {}
    throw new Error(`Header error ${res.status}: ${detail}`);
  }
  return ((await res.json()) as { metadata: PuzzleHeader }).metadata;
}
