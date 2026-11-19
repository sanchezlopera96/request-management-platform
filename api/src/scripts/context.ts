import { createDynamoClients } from '../infra/dynamodb/client.js';
import { DEFAULT_TABLE_NAME } from '../infra/dynamodb/table.js';

export function scriptContext() {
  const endpoint = process.env['DYNAMODB_ENDPOINT'] ?? 'http://localhost:8000';
  const region = process.env['AWS_REGION'] ?? 'us-east-1';
  const tableName = process.env['TABLE_NAME'] ?? DEFAULT_TABLE_NAME;
  return { ...createDynamoClients({ region, endpoint }), tableName, endpoint };
}

export function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}
