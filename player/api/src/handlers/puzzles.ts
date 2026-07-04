import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import { executeStatement } from "../lib/db";
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

async function listPuzzles(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const puzzleType = event.queryStringParameters?.puzzleType;

  let sql = "SELECT * FROM puzzle_questions";
  const params: { name: string; value: any }[] = [];

  if (puzzleType) {
    sql += " WHERE puzzle_type = :puzzleType";
    params.push({
      name: "puzzleType",
      value: { stringValue: puzzleType },
    });
  }

  sql += " ORDER BY created_at DESC";

  const result = await executeStatement(sql, params);
  return response(200, { puzzles: result.records.map(mapRecord) });
}

async function getPuzzle(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const id = event.pathParameters?.id;
  if (!id) return response(400, { error: "Missing puzzle id" });

  const result = await executeStatement(
    "SELECT * FROM puzzle_questions WHERE id = :id",
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
  if (!body.puzzleType || !body.metadata || !body.grid) {
    return response(400, {
      error: "puzzleType, metadata, and grid are required",
    });
  }

  const id = uuidv4();

  await executeStatement(
    `INSERT INTO puzzle_questions (id, puzzle_type, title, metadata, grid, constraints, solution)
     VALUES (:id, :puzzleType, :title, :metadata, :grid, :constraints, :solution)`,
    [
      { name: "id", value: { stringValue: id } },
      { name: "puzzleType", value: { stringValue: body.puzzleType } },
      { name: "title", value: body.title ? { stringValue: body.title } : { isNull: true } },
      { name: "metadata", value: { stringValue: JSON.stringify(body.metadata) } },
      { name: "grid", value: { stringValue: JSON.stringify(body.grid) } },
      { name: "constraints", value: body.constraints ? { stringValue: JSON.stringify(body.constraints) } : { isNull: true } },
      { name: "solution", value: body.solution ? { stringValue: JSON.stringify(body.solution) } : { isNull: true } },
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
