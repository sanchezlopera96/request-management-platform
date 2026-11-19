import { DEFAULT_TABLE_NAME } from '../infra/dynamodb/table.js';

const DEV_JWT_SECRET = 'dev-only-jwt-secret-change-me-0123456789';
const DEV_CURSOR_SECRET = 'dev-only-cursor-secret-0123456789';
export const DEV_ISSUER = 'request-desk-dev';

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
    jwtSecret: env['JWT_SECRET'] ?? DEV_JWT_SECRET,
    jwtIssuer: DEV_ISSUER,
    cursorSecret: env['CURSOR_SECRET'] ?? DEV_CURSOR_SECRET,
    corsOrigin: env['CORS_ORIGIN'] ?? true,
    logger: env['LOG_LEVEL'] !== 'silent',
  };
}
