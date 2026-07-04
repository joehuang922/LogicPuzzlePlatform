import {
  RDSDataClient,
  ExecuteStatementCommand,
  Field,
} from "@aws-sdk/client-rds-data";

const client = new RDSDataClient({});

const CLUSTER_ARN = process.env.CLUSTER_ARN!;
const SECRET_ARN = process.env.SECRET_ARN!;
const DATABASE_NAME = process.env.DATABASE_NAME!;

export interface QueryResult {
  records: Record<string, unknown>[];
  numberOfRecordsUpdated: number;
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

  const result = await client.send(command);

  const columns =
    result.columnMetadata?.map((col) => col.name ?? "") ?? [];
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

  return {
    records,
    numberOfRecordsUpdated: result.numberOfRecordsUpdated ?? 0,
  };
}
