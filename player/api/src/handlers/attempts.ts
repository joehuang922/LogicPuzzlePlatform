import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { executeStatement } from "../lib/db";

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function mapRecord(record: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    mapped[toCamelCase(key)] = value;
  }
  return mapped;
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

async function createAttempt(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (!event.body) return response(400, { error: "Missing request body" });

  const body = JSON.parse(event.body);
  if (!body.player || !body.question) {
    return response(400, { error: "player and question are required" });
  }

  const attemptId = uuidv4();

  await executeStatement(
    `INSERT INTO player_attempt (id, player, question) VALUES (:id, :player, :question)`,
    [
      { name: "id", value: { stringValue: attemptId } },
      { name: "player", value: { longValue: body.player } },
      { name: "question", value: { stringValue: body.question } },
    ]
  );

  const snapshotId = uuidv4();
  const initialAnswer = body.initialAnswer
    ? JSON.stringify(body.initialAnswer)
    : "{}";

  await executeStatement(
    `INSERT INTO player_attempt_snapshot (id, attempt, current_answer, progress, elapsed_seconds, finished)
     VALUES (:id, :attempt, :currentAnswer, 0, 0, FALSE)`,
    [
      { name: "id", value: { stringValue: snapshotId } },
      { name: "attempt", value: { stringValue: attemptId } },
      { name: "currentAnswer", value: { stringValue: initialAnswer } },
    ]
  );

  return response(201, { attemptId, snapshotId });
}

async function listAttempts(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const player = event.queryStringParameters?.player;
  const question = event.queryStringParameters?.question;

  if (!player || !question) {
    return response(400, { error: "player and question query params required" });
  }

  const finished = event.queryStringParameters?.finished;
  const finishedFilter = finished === "true"
    ? "AND pa.finished_at IS NOT NULL"
    : "AND pa.finished_at IS NULL";

  const result = await executeStatement(
    `SELECT pa.id, pa.created_at,
            s.progress AS latest_progress,
            s.elapsed_seconds AS latest_elapsed_seconds
     FROM player_attempt pa
     LEFT JOIN (
       SELECT attempt, progress, elapsed_seconds,
              ROW_NUMBER() OVER (PARTITION BY attempt ORDER BY created_at DESC) AS rn
       FROM player_attempt_snapshot
     ) s ON s.attempt = pa.id AND s.rn = 1
     WHERE pa.player = :player
       AND pa.question = :question
       ${finishedFilter}
     ORDER BY pa.created_at DESC`,
    [
      { name: "player", value: { longValue: Number(player) } },
      { name: "question", value: { stringValue: question } },
    ]
  );

  return response(200, { attempts: result.records.map(mapRecord) });
}

async function getAttemptSnapshot(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const attemptId = event.pathParameters?.id;
  if (!attemptId) return response(400, { error: "Missing attempt id" });

  const result = await executeStatement(
    `SELECT * FROM player_attempt_snapshot
     WHERE attempt = :attempt
     ORDER BY created_at DESC
     LIMIT 1`,
    [{ name: "attempt", value: { stringValue: attemptId } }]
  );

  if (result.records.length === 0) {
    return response(404, { error: "No snapshot found for this attempt" });
  }

  return response(200, { snapshot: mapRecord(result.records[0]) });
}

async function listAttemptSnapshots(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const attemptId = event.pathParameters?.id;
  if (!attemptId) return response(400, { error: "Missing attempt id" });

  const result = await executeStatement(
    `SELECT id, progress, elapsed_seconds, created_at
     FROM player_attempt_snapshot
     WHERE attempt = :attempt
     ORDER BY created_at DESC`,
    [{ name: "attempt", value: { stringValue: attemptId } }]
  );

  return response(200, { snapshots: result.records.map(mapRecord) });
}

async function getSnapshotById(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const snapshotId = event.queryStringParameters?.snapshotId;
  if (!snapshotId) return response(400, { error: "snapshotId query param required" });

  const result = await executeStatement(
    `SELECT * FROM player_attempt_snapshot WHERE id = :id`,
    [{ name: "id", value: { stringValue: snapshotId } }]
  );

  if (result.records.length === 0) {
    return response(404, { error: "Snapshot not found" });
  }

  return response(200, { snapshot: mapRecord(result.records[0]) });
}

async function saveSnapshot(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const attemptId = event.pathParameters?.id;
  if (!attemptId) return response(400, { error: "Missing attempt id" });
  if (!event.body) return response(400, { error: "Missing request body" });

  const body = JSON.parse(event.body);
  if (!body.currentAnswer || body.progress == null || body.elapsedSeconds == null) {
    return response(400, {
      error: "currentAnswer, progress, and elapsedSeconds are required",
    });
  }

  const snapshotId = uuidv4();

  await executeStatement(
    `INSERT INTO player_attempt_snapshot (id, attempt, current_answer, progress, elapsed_seconds, finished)
     VALUES (:id, :attempt, :currentAnswer, :progress, :elapsedSeconds, :finished)`,
    [
      { name: "id", value: { stringValue: snapshotId } },
      { name: "attempt", value: { stringValue: attemptId } },
      { name: "currentAnswer", value: { stringValue: JSON.stringify(body.currentAnswer) } },
      { name: "progress", value: { doubleValue: body.progress } },
      { name: "elapsedSeconds", value: { longValue: body.elapsedSeconds } },
      { name: "finished", value: { booleanValue: body.finished ?? false } },
    ]
  );

  if (body.finished) {
    await executeStatement(
      `UPDATE player_attempt SET finished_at = CURRENT_TIMESTAMP WHERE id = :id`,
      [{ name: "id", value: { stringValue: attemptId } }]
    );
  }

  return response(201, { snapshotId });
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const hasId = !!event.pathParameters?.id;
  const subResource = event.pathParameters?.proxy;

  switch (true) {
    case method === "POST" && !hasId:
      return createAttempt(event);
    case method === "GET" && !hasId:
      return listAttempts(event);
    case method === "GET" && hasId && subResource === "snapshot":
      return getAttemptSnapshot(event);
    case method === "GET" && hasId && subResource === "snapshots":
      if (event.queryStringParameters?.snapshotId) {
        return getSnapshotById(event);
      }
      return listAttemptSnapshots(event);
    case method === "POST" && hasId && subResource === "snapshot":
      return saveSnapshot(event);
    default:
      return response(405, { error: "Method not allowed" });
  }
}
