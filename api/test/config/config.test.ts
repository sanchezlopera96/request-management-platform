import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/config.js';

const jwksEnv = {
  AUTH_MODE: 'jwks',
  JWT_JWKS_URL: 'https://cognito-idp.us-east-1.amazonaws.com/pool/.well-known/jwks.json',
  JWT_ISSUER: 'https://cognito-idp.us-east-1.amazonaws.com/pool',
  JWT_AUDIENCE: 'web-client',
  CURSOR_SECRET: 'cursor-from-secrets-manager-0123456789',
};

describe('loadConfig', () => {
  describe('modo desarrollo (por defecto)', () => {
    it('sin secretos configurados genera unos aleatorios en cada arranque', () => {
      const first = loadConfig({});
      const second = loadConfig({});

      expect(first.auth.mode).toBe('dev');
      if (first.auth.mode !== 'dev' || second.auth.mode !== 'dev') return;
      expect(first.auth.secret.length).toBeGreaterThanOrEqual(32);
      expect(first.cursorSecret.length).toBeGreaterThanOrEqual(32);
      expect(first.auth.secret).not.toBe(first.cursorSecret);
      expect(second.auth.secret).not.toBe(first.auth.secret);
    });

    it('usa los secretos de las variables de entorno cuando existen', () => {
      const config = loadConfig({ JWT_SECRET: 'jwt-from-env-0123456789', CURSOR_SECRET: 'cursor-from-env-0123456789' });
      expect(config.auth).toMatchObject({ mode: 'dev', secret: 'jwt-from-env-0123456789' });
      expect(config.cursorSecret).toBe('cursor-from-env-0123456789');
    });
  });

  describe('modo AWS (AUTH_MODE=jwks)', () => {
    it('valida tokens de Cognito y no permite CORS abierto', () => {
      const config = loadConfig(jwksEnv);
      expect(config.auth).toEqual({
        mode: 'jwks',
        jwksUrl: jwksEnv.JWT_JWKS_URL,
        issuer: jwksEnv.JWT_ISSUER,
        audience: 'web-client',
      });
      expect(config.corsOrigin).toBe(false);
    });

    it.each(['JWT_JWKS_URL', 'JWT_ISSUER', 'CURSOR_SECRET'])(
      'exige %s: con varias tareas un secreto aleatorio por tarea rompería la paginación',
      (name) => {
        expect(() => loadConfig({ ...jwksEnv, [name]: undefined })).toThrow(`Falta la variable de entorno ${name}`);
      },
    );
  });
});
