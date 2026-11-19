import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/http/app.js';
import { RequestService } from '../../src/app/request-service.js';
import { CursorCodec } from '../../src/app/cursor.js';
import { InMemoryRequestRepository } from '../../src/infra/memory-request-repository.js';
import { UnauthenticatedError } from '../../src/domain/errors.js';
import { CURSOR_SECRET } from '../support/fixtures.js';

describe('buildApp sin autenticación de desarrollo (modo AWS)', () => {
  it('no expone los endpoints para emitir tokens de prueba', async () => {
    const app = await buildApp({
      service: new RequestService(new InMemoryRequestRepository(), new CursorCodec(CURSOR_SECRET)),
      verifier: {
        verify: () => {
          throw new UnauthenticatedError();
        },
      },
    });

    const token = await app.inject({ method: 'POST', url: '/api/dev/token', payload: { userId: 'sofia' } });
    const users = await app.inject({ method: 'GET', url: '/api/dev/users' });

    expect(token.statusCode).toBe(404);
    expect(users.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    await app.close();
  });
});
