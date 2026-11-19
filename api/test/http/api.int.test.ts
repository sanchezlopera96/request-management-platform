import { describe, it } from 'vitest';
import { CreateTableCommand, DeleteTableCommand, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { createDynamoClients } from '../../src/infra/dynamodb/client.js';
import { tableDefinition } from '../../src/infra/dynamodb/table.js';
import { DynamoRequestRepository } from '../../src/infra/dynamodb/dynamo-request-repository.js';
import { describeApiContract } from './api-contract.js';

const endpoint = process.env['DYNAMODB_ENDPOINT'];

if (!endpoint) {
  describe.skip('API de solicitudes [DynamoDB Local]', () => {
    it('requiere DYNAMODB_ENDPOINT', () => {});
  });
} else {
  describeApiContract('DynamoDB Local', async () => {
    const { client, doc } = createDynamoClients({ region: 'us-east-1', endpoint });
    const tableName = `it-requests-${Date.now()}`;
    await client.send(new CreateTableCommand(tableDefinition(tableName)));
    await waitUntilTableExists({ client, maxWaitTime: 30 }, { TableName: tableName });

    return {
      repository: new DynamoRequestRepository(doc, tableName),
      teardown: async () => {
        await client.send(new DeleteTableCommand({ TableName: tableName }));
      },
    };
  });
}
