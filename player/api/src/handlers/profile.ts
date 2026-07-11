import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { executeStatement } from "../lib/db";
import { evaluateAndUnlock, getAllDefinitions } from "../lib/achievements";

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

async function getProfile(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const playerId = event.queryStringParameters?.player;
  if (!playerId) {
    return response(400, { error: "player query param required" });
  }

  const playerResult = await executeStatement(
    `SELECT id, name FROM player_account WHERE id = :id`,
    [{ name: "id", value: { longValue: Number(playerId) } }]
  );

  if (playerResult.records.length === 0) {
    return response(404, { error: "Player not found" });
  }

  const player = mapRecord(playerResult.records[0]);

  const questionStatsResult = await executeStatement(
    `SELECT
       pt.id AS type_id,
       pt.name AS type_name,
       COUNT(DISTINCT pq.id) AS total,
       COUNT(DISTINCT CASE
         WHEN EXISTS (
           SELECT 1 FROM player_attempt pa
           WHERE pa.question = pq.id AND pa.player = :player AND pa.finished_at IS NOT NULL
         ) THEN pq.id
       END) AS solved,
       COUNT(DISTINCT CASE
         WHEN EXISTS (
           SELECT 1 FROM player_attempt pa2
           WHERE pa2.question = pq.id AND pa2.player = :player
         ) AND NOT EXISTS (
           SELECT 1 FROM player_attempt pa3
           WHERE pa3.question = pq.id AND pa3.player = :player AND pa3.finished_at IS NOT NULL
         ) THEN pq.id
       END) AS tried
     FROM puzzle_types pt
     LEFT JOIN puzzle_questions pq ON pq.puzzle_type = pt.id
     GROUP BY pt.id, pt.name
     ORDER BY pt.name`,
    [{ name: "player", value: { longValue: Number(playerId) } }]
  );

  const questionStats = questionStatsResult.records.map(mapRecord);

  const collectionStatsResult = await executeStatement(
    `SELECT
       pc.id AS collection_id,
       pc.name AS collection_name,
       pt.id AS type_id,
       pt.name AS type_name,
       COUNT(DISTINCT pq.id) AS total,
       COUNT(DISTINCT CASE WHEN pa.finished_at IS NOT NULL THEN pq.id END) AS solved
     FROM puzzle_collections pc
     JOIN puzzle_questions pq ON pq.src_collection = pc.id
     JOIN puzzle_types pt ON pq.puzzle_type = pt.id
     LEFT JOIN player_attempt pa ON pa.question = pq.id AND pa.player = :player AND pa.finished_at IS NOT NULL
     GROUP BY pc.id, pc.name, pt.id, pt.name
     ORDER BY pc.name, pt.name`,
    [{ name: "player", value: { longValue: Number(playerId) } }]
  );

  const collectionRows = collectionStatsResult.records.map(mapRecord);

  await evaluateAndUnlock(Number(playerId));

  const [definitions, achievementsResult] = await Promise.all([
    getAllDefinitions(),
    executeStatement(
      `SELECT achievement_id, unlocked_at FROM player_achievement WHERE player = :player`,
      [{ name: "player", value: { longValue: Number(playerId) } }]
    ),
  ]);

  const unlockedMap = new Map<string, string>();
  for (const row of achievementsResult.records) {
    unlockedMap.set(row.achievement_id as string, row.unlocked_at as string);
  }

  const achievements = definitions.map((def) => ({
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    category: def.category,
    unlocked: unlockedMap.has(def.id),
    unlockedAt: unlockedMap.get(def.id) ?? null,
  }));

  return response(200, { player, questionStats, collectionStats: collectionRows, achievements });
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === "GET") {
    return getProfile(event);
  }
  return response(405, { error: "Method not allowed" });
}
