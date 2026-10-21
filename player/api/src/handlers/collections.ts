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
     LEFT JOIN puzzle_questions pq
       ON pq.src_collection = pc.id AND pq.deleted_at IS NULL
     GROUP BY pc.id
     ORDER BY pc.id`
  );
  // Puzzles with no collection; clients show them as a default collection with
  // id 0 (the "none" bucket the manifest, puzzle list and progress endpoints accept).
  const uncollected = await executeStatement(
    `SELECT COUNT(*) AS n FROM puzzle_questions
     WHERE src_collection IS NULL AND deleted_at IS NULL`
  );
  const uncollectedCount = Number(uncollected.records[0]?.n ?? 0);
  return response(200, { collections: result.records.map(mapRecord), uncollectedCount });
}

/**
 * A tiny change-detection manifest for the offline client: the (id, updatedAt,
 * deletedAt) of every puzzle in a collection, with no canon_repr. The client
 * diffs this against its local copy to find edited / added / deleted puzzles
 * and only re-downloads full content for the ones that actually changed.
 * Includes soft-deleted rows so the client can hide them locally.
 */
async function collectionManifest(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const id = event.pathParameters?.id;
  if (!id) return response(400, { error: "Missing collection id" });

  // Id 0 is the default collection: puzzles with no collection.
  const none = Number(id) === 0;
  const result = await executeStatement(
    `SELECT id, updated_at, deleted_at
     FROM puzzle_questions
     WHERE ${none ? "src_collection IS NULL" : "src_collection = :id"}
     ORDER BY id`,
    none ? [] : [{ name: "id", value: { longValue: Number(id) } }]
  );

  return response(200, { puzzles: result.records.map(mapRecord) });
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
  const hasId = !!event.pathParameters?.id;
  const subResource = event.pathParameters?.proxy;

  if (method === "GET" && hasId && subResource === "manifest") {
    return collectionManifest(event);
  }
  if (method === "GET") {
    return listCollections();
  }
  if (method === "POST") {
    return createCollection(event);
  }

  return response(405, { error: "Method not allowed" });
}
