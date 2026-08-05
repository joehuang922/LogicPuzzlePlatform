import {
  RDSDataClient,
  ExecuteStatementCommand,
  Field,
} from "@aws-sdk/client-rds-data";

// Aurora Serverless v2 with min capacity 0 pauses when idle. The first request
// after a pause fails while the cluster resumes (~10-25s). Give the SDK a few
// built-in retries with adaptive backoff on top of our explicit resume retry.
const client = new RDSDataClient({
  maxAttempts: 5,
  retryMode: "adaptive",
});

// Errors the Data API raises while the cluster is waking from a paused state.
const RESUMING_ERROR_NAMES = new Set([
  "DatabaseResumingException",
  "StatementTimeoutException",
]);

function isResumingError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | undefined;
  if (e?.name && RESUMING_ERROR_NAMES.has(e.name)) return true;
  return /resuming|is paused|starting up|not currently available/i.test(
    e?.message ?? ""
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry only on resume-related errors. The total budget stays under the Lambda
// timeout (29s): 6 attempts of 1s,2s,4s,8s,8s backoff (+jitter) ≈ 23s worst case.
async function withResumeRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 6
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts - 1 || !isResumingError(err)) throw err;
      const base = Math.min(1000 * 2 ** attempt, 8000);
      const jitter = Math.floor(Math.random() * 250);
      await sleep(base + jitter);
    }
  }
}

const CLUSTER_ARN = process.env.CLUSTER_ARN!;
const SECRET_ARN = process.env.SECRET_ARN!;
const DATABASE_NAME = process.env.DATABASE_NAME!;

export interface QueryResult {
  records: Record<string, unknown>[];
  numberOfRecordsUpdated: number;
  generatedId: number | null;
}

function unwrapField(field: Field): unknown {
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return field.longValue;
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.isNull) return null;
  if (field.blobValue !== undefined) return field.blobValue;
  return null;
}

export async function executeStatement(
  sql: string,
  parameters: { name: string; value: Field }[] = []
): Promise<QueryResult> {
  const command = new ExecuteStatementCommand({
    resourceArn: CLUSTER_ARN,
    secretArn: SECRET_ARN,
    database: DATABASE_NAME,
    sql,
    parameters: parameters.map((p) => ({
      name: p.name,
      value: p.value,
    })),
    includeResultMetadata: true,
  });

  const result = await withResumeRetry(() => client.send(command));

  const columns =
    result.columnMetadata?.map((col) => col.label || col.name || "") ?? [];
  const records: Record<string, unknown>[] = [];

  if (result.records) {
    for (const row of result.records) {
      const record: Record<string, unknown> = {};
      for (let i = 0; i < columns.length; i++) {
        record[columns[i]] = unwrapField(row[i]);
      }
      records.push(record);
    }
  }

  const generatedId = result.generatedFields?.[0]?.longValue ?? null;

  return {
    records,
    numberOfRecordsUpdated: result.numberOfRecordsUpdated ?? 0,
    generatedId,
  };
}
