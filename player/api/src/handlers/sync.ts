import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { executeStatement } from "../lib/db";
import { evaluateAndUnlock } from "../lib/achievements";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function response(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

interface SnapshotInput {
  id: string;
  currentAnswer: unknown;
  progress: number;
  elapsedSeconds: number;
  finished?: boolean;
  createdAt?: string;
}

interface AttemptInput {
  id: string;
  question: string;
  createdAt?: string;
  snapshots?: SnapshotInput[];
}

// MySQL DATETIME literal: 'YYYY-MM-DD HH:MM:SS'. Reject anything else so a bad
// value falls back to CURRENT_TIMESTAMP rather than corrupting the row.
const DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

function isDatetime(value: unknown): value is string {
  return typeof value === "string" && DATETIME_RE.test(value);
}

/**
 * POST: batch upstream sync for the offline-capable Android client. The client pushes
 * every locally-created attempt and snapshot in one request, so a whole offline
 * session costs a single (cold-start-amortized) round trip.
 *
 * Everything is keyed by client-generated UUIDs and inserted with INSERT IGNORE,
 * so the whole batch is idempotent: a retried or duplicated push is a no-op.
 * Achievements are recomputed once at the end and returned as the authoritative
 * set for the client to reconcile against its optimistic local state.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === "POST") return push(event);
  if (event.httpMethod === "GET") return pull(event);
  return response(405, { error: "Method not allowed" });
}

async function push(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (!event.body) return response(400, { error: "Missing request body" });

  const body = JSON.parse(event.body);
  const player = body.player;
  if (!player) return response(400, { error: "player is required" });

  const attempts: AttemptInput[] = Array.isArray(body.attempts)
    ? body.attempts
    : [];

  const syncedAttemptIds: string[] = [];
  const syncedSnapshotIds: string[] = [];
  // Set finished_at once for any attempt that carries a finished snapshot.
  const finishedAttemptIds = new Set<string>();

  for (const attempt of attempts) {
    if (!isUuid(attempt.id) || !attempt.question) continue;

    // Preserve the client's created_at so a batch of offline snapshots keeps its
    // ordering (the server reads latest-by-created_at); default to now if absent.
    const attemptCreatedAt = isDatetime(attempt.createdAt)
      ? `:createdAt`
      : `CURRENT_TIMESTAMP`;
    const attemptParams = [
      { name: "id", value: { stringValue: attempt.id } },
      { name: "player", value: { longValue: Number(player) } },
      { name: "question", value: { stringValue: attempt.question } },
    ];
    if (isDatetime(attempt.createdAt)) {
      attemptParams.push({
        name: "createdAt",
        value: { stringValue: attempt.createdAt },
      });
    }
    await executeStatement(
      `INSERT IGNORE INTO player_attempt (id, player, question, created_at)
       VALUES (:id, :player, :question, ${attemptCreatedAt})`,
      attemptParams
    );
    syncedAttemptIds.push(attempt.id);

    for (const snap of attempt.snapshots ?? []) {
      if (!isUuid(snap.id)) continue;

      const snapCreatedAt = isDatetime(snap.createdAt)
        ? `:createdAt`
        : `CURRENT_TIMESTAMP`;
      const snapParams = [
        { name: "id", value: { stringValue: snap.id } },
        { name: "attempt", value: { stringValue: attempt.id } },
        {
          name: "currentAnswer",
          value: { stringValue: JSON.stringify(snap.currentAnswer ?? {}) },
        },
        { name: "progress", value: { doubleValue: snap.progress ?? 0 } },
        {
          name: "elapsedSeconds",
          value: { longValue: snap.elapsedSeconds ?? 0 },
        },
        { name: "finished", value: { booleanValue: !!snap.finished } },
      ];
      if (isDatetime(snap.createdAt)) {
        snapParams.push({
          name: "createdAt",
          value: { stringValue: snap.createdAt },
        });
      }
      await executeStatement(
        `INSERT IGNORE INTO player_attempt_snapshot
           (id, attempt, current_answer, progress, elapsed_seconds, finished, created_at)
         VALUES (:id, :attempt, :currentAnswer, :progress, :elapsedSeconds, :finished, ${snapCreatedAt})`,
        snapParams
      );
      syncedSnapshotIds.push(snap.id);
      if (snap.finished) finishedAttemptIds.add(attempt.id);
    }
  }

  for (const attemptId of finishedAttemptIds) {
    // finished_at is set-once and monotonic; only stamp it if still null so a
    // replay never moves the completion time.
    await executeStatement(
      `UPDATE player_attempt SET finished_at = CURRENT_TIMESTAMP
       WHERE id = :id AND finished_at IS NULL`,
      [{ name: "id", value: { stringValue: attemptId } }]
    );
  }

  let newAchievements: unknown[] = [];
  if (finishedAttemptIds.size > 0) {
    newAchievements = await evaluateAndUnlock(Number(player));
  }

  return response(200, {
    syncedAttemptIds,
    syncedSnapshotIds,
    newAchievements,
  });
}

// Snapshots per pull page. A snapshot's current_answer averages ~2KB, so a page
// stays well under the 6MB Lambda response cap.
const PULL_PAGE_SIZE = 300;

// Rows received in the last few seconds are left for the next pull, so a row
// whose statement committed just after we read NOW() can never fall behind the
// cursor the client stores.
const SETTLE_SECONDS = 5;

const DATETIME_FMT = "'%Y-%m-%d %H:%i:%s'";

/**
 * GET: incremental downstream sync of a player's progress, for every puzzle,
 * in one round trip instead of several requests per puzzle.
 *
 * The window is (since, until]: `since` is the `until` the client stored after
 * its last complete pull (absent => everything), and `until` is fixed by the
 * first page and echoed back on the following ones. Changes are measured by
 * server receive time (player_attempt.changed_at, player_attempt_snapshot.
 * received_at), never by created_at, which /sync push copies from the client.
 *
 * Attempts (small rows: id, question, timestamps) changed in the window come
 * on the first page. Snapshots are paged by (received_at, id); `next` is the
 * keyset cursor for the following page, null on the last one. The client
 * stores `until` only once every page is merged, so an interrupted pull is
 * simply repeated; its merge is union-by-UUID, so re-delivery is harmless.
 */
async function pull(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const params = event.queryStringParameters ?? {};
  const player = Number(params.player);
  if (!Number.isInteger(player) || player <= 0) {
    return response(400, { error: "player is required" });
  }
  const since = params.since;
  if (since !== undefined && !isDatetime(since)) {
    return response(400, { error: "since must be 'YYYY-MM-DD HH:MM:SS'" });
  }
  let until = params.until;
  if (until !== undefined && !isDatetime(until)) {
    return response(400, { error: "until must be 'YYYY-MM-DD HH:MM:SS'" });
  }
  let after: { receivedAt: string; id: string } | undefined;
  if (params.after !== undefined) {
    const [receivedAt, id] = params.after.split("|");
    if (!isDatetime(receivedAt) || !isUuid(id) || until === undefined) {
      return response(400, { error: "after must be '<datetime>|<uuid>' with until" });
    }
    after = { receivedAt, id };
  }

  if (until === undefined) {
    const now = await executeStatement(
      `SELECT DATE_FORMAT(NOW() - INTERVAL ${SETTLE_SECONDS} SECOND, ${DATETIME_FMT}) AS until_at`
    );
    until = String(now.records[0].until_at);
  }

  const playerParam = { name: "player", value: { longValue: player } };
  const untilParam = { name: "until", value: { stringValue: until } };
  const sinceParam = since
    ? [{ name: "since", value: { stringValue: since } }]
    : [];

  let attempts: unknown[] = [];
  if (!after) {
    const rows = await executeStatement(
      `SELECT id, question,
              DATE_FORMAT(created_at, ${DATETIME_FMT}) AS created_at,
              DATE_FORMAT(finished_at, ${DATETIME_FMT}) AS finished_at
       FROM player_attempt
       WHERE player = :player AND changed_at <= :until
         ${since ? "AND changed_at > :since" : ""}`,
      [playerParam, untilParam, ...sinceParam]
    );
    attempts = rows.records.map((r) => ({
      id: r.id,
      question: r.question,
      createdAt: r.created_at,
      finishedAt: r.finished_at ?? null,
    }));
  }

  const afterParams = after
    ? [
        { name: "afterAt", value: { stringValue: after.receivedAt } },
        { name: "afterId", value: { stringValue: after.id } },
      ]
    : [];
  const snapRows = await executeStatement(
    `SELECT s.id, s.attempt, s.current_answer, s.progress, s.elapsed_seconds,
            s.finished,
            DATE_FORMAT(s.created_at, ${DATETIME_FMT}) AS created_at,
            DATE_FORMAT(s.received_at, ${DATETIME_FMT}) AS received_at
     FROM player_attempt_snapshot s
     JOIN player_attempt a ON a.id = s.attempt
     WHERE a.player = :player AND s.received_at <= :until
       ${since ? "AND s.received_at > :since" : ""}
       ${after ? "AND (s.received_at > :afterAt OR (s.received_at = :afterAt AND s.id > :afterId))" : ""}
     ORDER BY s.received_at, s.id
     LIMIT ${PULL_PAGE_SIZE + 1}`,
    [playerParam, untilParam, ...sinceParam, ...afterParams]
  );
  const page = snapRows.records.slice(0, PULL_PAGE_SIZE);
  const last = page[page.length - 1];
  const next =
    snapRows.records.length > PULL_PAGE_SIZE && last
      ? `${last.received_at}|${last.id}`
      : null;

  return response(200, {
    attempts,
    snapshots: page.map((r) => ({
      id: r.id,
      attempt: r.attempt,
      currentAnswer: r.current_answer,
      progress: r.progress,
      elapsedSeconds: r.elapsed_seconds,
      finished: !!r.finished,
      createdAt: r.created_at,
    })),
    until,
    next,
  });
}
