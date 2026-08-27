import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const BUCKET = process.env.ASSETS_BUCKET!;
const CDN_URL = process.env.ASSETS_CDN_URL!;
const PRESIGN_TTL_SECONDS = 300;

// Content types we're willing to hand out upload URLs for, mapped to the file
// extension we store under. Keeps the namespace to known image formats.
const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

const s3 = new S3Client({});

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

async function createUploadUrl(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (!event.body) return response(400, { error: "Missing request body" });

  const body = JSON.parse(event.body);
  const contentType: string | undefined = body.contentType;
  if (!contentType || !EXTENSION_BY_TYPE[contentType]) {
    return response(400, {
      error: `Unsupported contentType. Allowed: ${Object.keys(EXTENSION_BY_TYPE).join(", ")}`,
    });
  }

  const key = `covers/${randomUUID()}.${EXTENSION_BY_TYPE[contentType]}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: PRESIGN_TTL_SECONDS }
  );

  return response(200, {
    uploadUrl,
    // Stable public URL to persist as the cover source once the PUT succeeds.
    publicUrl: `${CDN_URL}/${key}`,
  });
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  if (event.httpMethod === "POST") {
    return createUploadUrl(event);
  }
  return response(405, { error: "Method not allowed" });
}
