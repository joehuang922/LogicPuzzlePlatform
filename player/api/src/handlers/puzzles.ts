import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { executeStatement } from "../lib/db";
import { validateCanon } from "../lib/schema";
import { CreatePuzzleRequest } from "../models/types";

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

const PUZZLE_SELECT = `
  SELECT pq.*,
         pt.name AS puzzle_type_name,
         pc.name AS src_collection_name
  FROM puzzle_questions pq
  JOIN puzzle_types pt ON pq.puzzle_type = pt.id
  LEFT JOIN puzzle_collections pc ON pq.src_collection = pc.id`;

async function listPuzzles(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const puzzleType = event.queryStringParameters?.puzzleType;
  const srcCollection = event.queryStringParameters?.srcCollection;

  let sql = PUZZLE_SELECT;
  const params: { name: string; value: any }[] = [];
  const conditions: string[] = [];

  if (puzzleType) {
    conditions.push("pq.puzzle_type = :puzzleType");
    params.push({
      name: "puzzleType",
      value: { longValue: Number(puzzleType) },
    });
  }

  if (srcCollection) {
    conditions.push("pq.src_collection = :srcCollection");
    params.push({
      name: "srcCollection",
      value: { longValue: Number(srcCollection) },
    });
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY pq.created_at DESC";

  const result = await executeStatement(sql, params);
  return response(200, { puzzles: result.records.map(mapRecord) });
}

async function getPuzzle(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const id = event.pathParameters?.id;
  if (!id) return response(400, { error: "Missing puzzle id" });

  const result = await executeStatement(
    `${PUZZLE_SELECT} WHERE pq.id = :id`,
    [{ name: "id", value: { stringValue: id } }]
  );

  if (result.records.length === 0) {
    return response(404, { error: "Puzzle not found" });
  }

  return response(200, { puzzle: mapRecord(result.records[0]) });
}

async function createPuzzle(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (!event.body) return response(400, { error: "Missing request body" });

  const body: CreatePuzzleRequest = JSON.parse(event.body);
  if (!body.puzzleType || !body.canonRepr || body.difficulty == null) {
    return response(400, {
      error: "puzzleType, difficulty, and canonRepr are required",
    });
  }

  try {
    validateCanon(body.puzzleType, body.canonRepr);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Invalid canonRepr";
    return response(400, { error: message });
  }

  const id = uuidv4();

  await executeStatement(
    `INSERT INTO puzzle_questions (id, puzzle_type, title, author, difficulty, width, height, canon_repr, src_collection)
     VALUES (:id, :puzzleType, :title, :author, :difficulty, :width, :height, :canonRepr, :srcCollection)`,
    [
      { name: "id", value: { stringValue: id } },
      { name: "puzzleType", value: { longValue: body.puzzleType } },
      { name: "title", value: body.title ? { stringValue: body.title } : { isNull: true } },
      { name: "author", value: body.author ? { stringValue: body.author } : { isNull: true } },
      { name: "difficulty", value: { longValue: body.difficulty } },
      { name: "width", value: body.width != null ? { longValue: body.width } : { isNull: true } },
      { name: "height", value: body.height != null ? { longValue: body.height } : { isNull: true } },
      { name: "canonRepr", value: { stringValue: JSON.stringify(body.canonRepr) } },
      { name: "srcCollection", value: body.srcCollection != null ? { longValue: body.srcCollection } : { isNull: true } },
    ]
  );

  return response(201, { id });
}

async function deletePuzzle(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const id = event.pathParameters?.id;
  if (!id) return response(400, { error: "Missing puzzle id" });

  await executeStatement("DELETE FROM puzzle_questions WHERE id = :id", [
    { name: "id", value: { stringValue: id } },
  ]);

  return response(204, null);
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;
  const hasId = !!event.pathParameters?.id;

  switch (true) {
    case method === "GET" && !hasId:
      return listPuzzles(event);
    case method === "GET" && hasId:
      return getPuzzle(event);
    case method === "POST":
      return createPuzzle(event);
    case method === "DELETE" && hasId:
      return deletePuzzle(event);
    default:
      return response(405, { error: "Method not allowed" });
  }
}
