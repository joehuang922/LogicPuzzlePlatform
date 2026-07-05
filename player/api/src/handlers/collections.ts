import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
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

async function listCollections(): Promise<APIGatewayProxyResult> {
  const result = await executeStatement(
    `SELECT pc.*, COUNT(pq.id) AS puzzle_count
     FROM puzzle_collections pc
     LEFT JOIN puzzle_questions pq ON pq.src_collection = pc.id
     GROUP BY pc.id
     ORDER BY pc.id`
  );
  return response(200, { collections: result.records.map(mapRecord) });
}

async function createCollection(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (!event.body) return response(400, { error: "Missing request body" });

  const body = JSON.parse(event.body);
  if (!body.name) {
    return response(400, { error: "name is required" });
  }

  const result = await executeStatement(
    `INSERT INTO puzzle_collections (name, publisher, publish_at, cover_src)
     VALUES (:name, :publisher, :publishAt, :coverSrc)`,
    [
      { name: "name", value: { stringValue: body.name } },
      { name: "publisher", value: body.publisher ? { stringValue: body.publisher } : { isNull: true } },
      { name: "publishAt", value: body.publishAt ? { stringValue: body.publishAt } : { isNull: true } },
      { name: "coverSrc", value: body.coverSrc ? { stringValue: body.coverSrc } : { isNull: true } },
    ]
  );

  return response(201, { id: result.generatedId });
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod;

  if (method === "GET") {
    return listCollections();
  }
  if (method === "POST") {
    return createCollection(event);
  }

  return response(405, { error: "Method not allowed" });
}
