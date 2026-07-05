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
  const result = await executeStatement(
    "SELECT id, name, rule FROM puzzle_types ORDER BY id"
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
