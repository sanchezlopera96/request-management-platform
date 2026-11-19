import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface DynamoConfig {
  region: string;
  endpoint?: string;
}

export function createDynamoClients(config: DynamoConfig) {
  const client = new DynamoDBClient({
    region: config.region,
    ...(config.endpoint
      ? {
          endpoint: config.endpoint,
          credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
        }
      : {}),
  });
  const doc = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return { client, doc };
}
