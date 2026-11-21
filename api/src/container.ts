import type { AppConfig } from './config/config.js';
import { CursorCodec } from './app/cursor.js';
import { RequestService } from './app/request-service.js';
import type { RequestRepository } from './app/ports.js';
import { InMemoryRequestRepository } from './infra/memory-request-repository.js';
import { DynamoRequestRepository } from './infra/dynamodb/dynamo-request-repository.js';
import { createDynamoClients } from './infra/dynamodb/client.js';
import { createHmacVerifier, createJwksVerifier } from './http/auth.js';
import type { AppDependencies } from './http/app.js';

export function createDependencies(config: AppConfig): AppDependencies {
  const repository: RequestRepository =
    config.repository === 'memory'
      ? new InMemoryRequestRepository()
      : new DynamoRequestRepository(
          createDynamoClients({ region: config.region, endpoint: config.dynamoEndpoint }).doc,
          config.tableName,
        );

  const common = {
    service: new RequestService(repository, new CursorCodec(config.cursorSecret)),
    corsOrigin: config.corsOrigin,
    logger: config.logger,
  };

  if (config.auth.mode === 'jwks') {
    return {
      ...common,
      verifier: createJwksVerifier(config.auth.jwksUrl, config.auth.issuer, config.auth.audience),
    };
  }

  return {
    ...common,
    verifier: createHmacVerifier(config.auth.secret, config.auth.issuer),
    devAuth: { secret: config.auth.secret, issuer: config.auth.issuer },
  };
}
