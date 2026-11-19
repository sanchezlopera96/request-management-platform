import type { AppConfig } from './config/config.js';
import { CursorCodec } from './app/cursor.js';
import { RequestService } from './app/request-service.js';
import type { RequestRepository } from './app/ports.js';
import { InMemoryRequestRepository } from './infra/memory-request-repository.js';
import { DynamoRequestRepository } from './infra/dynamodb/dynamo-request-repository.js';
import { createDynamoClients } from './infra/dynamodb/client.js';
import { createHmacVerifier } from './http/auth.js';
import type { AppDependencies } from './http/app.js';

export function createDependencies(config: AppConfig): AppDependencies {
  const repository: RequestRepository =
    config.repository === 'memory'
      ? new InMemoryRequestRepository()
      : new DynamoRequestRepository(
          createDynamoClients({ region: config.region, endpoint: config.dynamoEndpoint }).doc,
          config.tableName,
        );

  return {
    service: new RequestService(repository, new CursorCodec(config.cursorSecret)),
    verifier: createHmacVerifier(config.jwtSecret, config.jwtIssuer),
    devAuth: { secret: config.jwtSecret, issuer: config.jwtIssuer },
    corsOrigin: config.corsOrigin,
    logger: config.logger,
  };
}
