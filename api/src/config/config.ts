import { randomBytes } from 'node:crypto';
import { DEFAULT_TABLE_NAME } from '../infra/dynamodb/table.js';

export const DEV_ISSUER = 'request-desk-dev';

export type AuthConfig =
  | { mode: 'dev'; secret: string; issuer: string }
  | { mode: 'jwks'; jwksUrl: string; issuer: string; audience?: string };

export interface AppConfig {
  port: number;
  repository: 'dynamodb' | 'memory';
  tableName: string;
  region: string;
  dynamoEndpoint?: string;
  auth: AuthConfig;
  cursorSecret: string;
  corsOrigin: string | boolean;
  logger: boolean;
}

function randomSecret(): string {
  return randomBytes(32).toString('base64url');
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const jwks = env['AUTH_MODE'] === 'jwks';

  const auth: AuthConfig = jwks
    ? {
        mode: 'jwks',
        jwksUrl: required(env, 'JWT_JWKS_URL'),
        issuer: required(env, 'JWT_ISSUER'),
        ...(env['JWT_AUDIENCE'] ? { audience: env['JWT_AUDIENCE'] } : {}),
      }
    : { mode: 'dev', secret: env['JWT_SECRET'] ?? randomSecret(), issuer: DEV_ISSUER };

  return {
    port: Number(env['PORT'] ?? 3000),
    repository: env['REPOSITORY'] === 'memory' ? 'memory' : 'dynamodb',
    tableName: env['TABLE_NAME'] ?? DEFAULT_TABLE_NAME,
    region: env['AWS_REGION'] ?? 'us-east-1',
    ...(env['DYNAMODB_ENDPOINT'] ? { dynamoEndpoint: env['DYNAMODB_ENDPOINT'] } : {}),
    auth,
    cursorSecret: jwks ? required(env, 'CURSOR_SECRET') : (env['CURSOR_SECRET'] ?? randomSecret()),
    corsOrigin: env['CORS_ORIGIN'] ?? !jwks,
    logger: env['LOG_LEVEL'] !== 'silent',
  };
}
