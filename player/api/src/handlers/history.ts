import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { getHistory, parseHistoryQuery } from "../lib/history";

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

/**
 * GET /history?player=&from=YYYY-MM-DD&to=YYYY-MM-DD&tz=Asia/Taipei&metric=solved
 *
 * A player's activity per day (in tz, default UTC) over [from, to] inclusive:
 * { from, to, tz, metric, days: { "2026-11-03": { "12": 2, "31": 1 }, ... } },
 * where days[date][typeId] counts that type's events that day. Days without
 * activity are omitted. See lib/history.ts for the metrics.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod !== "GET") {
    return response(405, { error: "Method not allowed" });
  }
  const query = parseHistoryQuery(event.queryStringParameters);
  if ("error" in query) return response(400, { error: query.error });
  return response(200, await getHistory(query));
}
