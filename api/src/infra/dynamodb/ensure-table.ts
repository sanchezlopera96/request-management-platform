import {
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
  waitUntilTableExists,
  type DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { tableDefinition } from './table.js';

async function waitForDynamo(client: DynamoDBClient, tableName: string, attempts = 60): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await client.send(new DescribeTableCommand({ TableName: tableName }));
      return;
    } catch (error) {
      if (error instanceof ResourceNotFoundException) return;
      if (i === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

export async function ensureTable(client: DynamoDBClient, tableName: string): Promise<void> {
  await waitForDynamo(client, tableName);
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.info(`Tabla "${tableName}" ya existe.`);
    return;
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
  }
  await client.send(new CreateTableCommand(tableDefinition(tableName)));
  await waitUntilTableExists({ client, maxWaitTime: 60 }, { TableName: tableName });
  console.info(`Tabla "${tableName}" creada.`);
}
