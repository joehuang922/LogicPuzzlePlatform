import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { executeStatement } from "../lib/db";

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

async function listPuzzleTypes(): Promise<APIGatewayProxyResult> {
  // puzzleCount: live (not soft-deleted) puzzles of the type, so clients can
  // list only the types that have puzzles (Android Home's type-first view).
  const result = await executeStatement(
    `SELECT pt.id, pt.name, pt.jp_label AS jpLabel, pt.rule,
            (SELECT COUNT(*) FROM puzzle_questions pq
              WHERE pq.puzzle_type = pt.id AND pq.deleted_at IS NULL) AS puzzleCount
     FROM puzzle_types pt ORDER BY pt.id`
  );
  return response(200, { puzzleTypes: result.records });
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === "GET") {
    return listPuzzleTypes();
  }
  return response(405, { error: "Method not allowed" });
}
