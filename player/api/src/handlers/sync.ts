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
 * Batch upstream sync for the offline-capable Android client. The client pushes
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
  if (event.httpMethod !== "POST") {
    return response(405, { error: "Method not allowed" });
  }
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
