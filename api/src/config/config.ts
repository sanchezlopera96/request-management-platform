import { randomBytes } from 'node:crypto';
import { DEFAULT_TABLE_NAME } from '../infra/dynamodb/table.js';

export const DEV_ISSUER = 'request-desk-dev';

function randomSecret(): string {
  return randomBytes(32).toString('base64url');
}

export interface AppConfig {
  port: number;
  repository: 'dynamodb' | 'memory';
  tableName: string;
  region: string;
  dynamoEndpoint?: string;
  jwtSecret: string;
  jwtIssuer: string;
  cursorSecret: string;
  corsOrigin: string | boolean;
  logger: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env['PORT'] ?? 3000),
    repository: env['REPOSITORY'] === 'memory' ? 'memory' : 'dynamodb',
    tableName: env['TABLE_NAME'] ?? DEFAULT_TABLE_NAME,
    region: env['AWS_REGION'] ?? 'us-east-1',
    ...(env['DYNAMODB_ENDPOINT'] ? { dynamoEndpoint: env['DYNAMODB_ENDPOINT'] } : {}),
    jwtSecret: env['JWT_SECRET'] ?? randomSecret(),
    jwtIssuer: DEV_ISSUER,
    cursorSecret: env['CURSOR_SECRET'] ?? randomSecret(),
    corsOrigin: env['CORS_ORIGIN'] ?? true,
    logger: env['LOG_LEVEL'] !== 'silent',
  };
}
