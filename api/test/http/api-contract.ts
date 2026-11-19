import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/http/app.js';
import { createHmacVerifier, signDevToken } from '../../src/http/auth.js';
import { RequestService } from '../../src/app/request-service.js';
import { CursorCodec } from '../../src/app/cursor.js';
import type { RequestRepository } from '../../src/app/ports.js';
import type { Principal } from '../../src/app/identity.js';
import { CURSOR_SECRET } from '../support/fixtures.js';

const JWT_SECRET = 'test-jwt-secret-0123456789abcdef';
const ISSUER = 'test-issuer';

export function describeApiContract(
  name: string,
  setup: () => Promise<{ repository: RequestRepository; teardown?: () => Promise<void> }>,
) {
  describe(`API de solicitudes [${name}]`, () => {
    let app: FastifyInstance;
    let teardown: (() => Promise<void>) | undefined;

    const run = Math.random().toString(36).slice(2, 8);
    const TA = `ta-${run}`;
    const TB = `tb-${run}`;
    const TC = `tc-${run}`;

    const userA: Principal = { userId: 'ua', name: 'A', role: 'TENANT_USER', tenantId: TA, tenants: [] };
    const userB: Principal = { userId: 'ub', name: 'B', role: 'TENANT_USER', tenantId: TB, tenants: [] };
    const analyst: Principal = { userId: 'an', name: 'Analista', role: 'ANALYST', tenants: [TA, TB] };
    const tokens = new Map<Principal, string>();

    const call = async (
      who: Principal | null,
      method: 'GET' | 'POST',
      url: string,
      body?: unknown,
      tenant?: string,
    ): Promise<LightMyRequestResponse> => {
      const headers: Record<string, string> = {};
      if (who) headers['authorization'] = `Bearer ${tokens.get(who)}`;
      if (tenant) headers['x-tenant-id'] = tenant;
      return app.inject({ method, url, headers, ...(body !== undefined ? { payload: body as object } : {}) });
    };

    const create = async (who: Principal, subject = 'Pago de nómina') => {
      const res = await call(who, 'POST', '/api/requests', { subject, description: 'Detalle', category: 'PAYROLL' });
      expect(res.statusCode).toBe(201);
      return res.json<{ folio: string; status: string }>();
    };

    const act = (who: Principal, folio: string, action: string, tenant?: string) =>
      call(who, 'POST', `/api/requests/${folio}/actions`, { action }, tenant);

    beforeAll(async () => {
      const ctx = await setup();
      teardown = ctx.teardown;
      const service = new RequestService(ctx.repository, new CursorCodec(CURSOR_SECRET));
      app = await buildApp({
        service,
        verifier: createHmacVerifier(JWT_SECRET, ISSUER),
        devAuth: { secret: JWT_SECRET, issuer: ISSUER },
      });
      for (const p of [userA, userB, analyst]) tokens.set(p, await signDevToken(p, JWT_SECRET, ISSUER));
    });

    afterAll(async () => {
      await app?.close();
      await teardown?.();
    });

    describe('Problema 3: una filial no puede ver ni modificar lo de otra', () => {
      let foreignFolio: string;

      beforeAll(async () => {
        await create(userA, 'Solicitud de A');
        await create(userB, 'Solicitud de B 1');
        await create(userB, 'Solicitud de B 2');
        foreignFolio = 'SOL-000002';
      });

      it('no puede listar solicitudes de otra filial, ni pidiéndolo explícitamente', async () => {
        const own = await call(userA, 'GET', '/api/requests');
        const forced = await call(userA, 'GET', '/api/requests', undefined, TB);

        for (const res of [own, forced]) {
          expect(res.statusCode).toBe(200);
          const items = res.json<{ items: { tenantId: string; subject: string }[] }>().items;
          expect(items).toHaveLength(1);
          expect(items.every((i) => i.tenantId === TA)).toBe(true);
        }
      });

      it('no puede consultar una solicitud ajena aunque conozca su identificador, y no revela que existe', async () => {
        const foreign = await call(userA, 'GET', `/api/requests/${foreignFolio}`, undefined, TB);
        const missing = await call(userA, 'GET', '/api/requests/SOL-999999');
        const garbage = await call(userA, 'GET', '/api/requests/TENANT%23x');

        expect(foreign.statusCode).toBe(404);
        expect(foreign.body).toBe(missing.body);
        expect(garbage.body).toBe(missing.body);
        expect(foreign.json()).toEqual({ error: { code: 'REQUEST_NOT_FOUND', message: 'La solicitud no existe.' } });

        const history = await call(userA, 'GET', `/api/requests/${foreignFolio}/history`, undefined, TB);
        expect(history.statusCode).toBe(404);
        expect(history.body).toBe(missing.body);
      });

      it('no puede modificar una solicitud ajena, y esta queda intacta', async () => {
        const before = await call(userB, 'GET', `/api/requests/${foreignFolio}`);
        const missing = await act(userA, 'SOL-999999', 'CONFIRM');
        const attempt = await act(userA, foreignFolio, 'CONFIRM', TB);

        expect(attempt.statusCode).toBe(404);
        expect(attempt.body).toBe(missing.body);
        const after = await call(userB, 'GET', `/api/requests/${foreignFolio}`);
        expect(after.json()).toEqual(before.json());
      });

      it('no puede reutilizar un cursor de paginación emitido para otra filial', async () => {
        await create(userB, 'Solicitud de B 3');
        const page = await call(userB, 'GET', '/api/requests?limit=1');
        const cursor = page.json<{ nextCursor: string }>().nextCursor;
        expect(cursor).toBeTruthy();

        const res = await call(userA, 'GET', `/api/requests?cursor=${encodeURIComponent(cursor)}`);
        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('INVALID_CURSOR');
      });

      it('un analista solo opera las filiales que tiene asignadas', async () => {
        const assigned = await call(analyst, 'GET', '/api/requests', undefined, TB);
        const notAssigned = await call(analyst, 'GET', '/api/requests', undefined, TC);
        const noTenant = await call(analyst, 'GET', '/api/requests');

        expect(assigned.statusCode).toBe(200);
        expect(notAssigned.statusCode).toBe(403);
        expect(notAssigned.json().error.code).toBe('TENANT_NOT_ASSIGNED');
        expect(noTenant.statusCode).toBe(400);
      });
    });

    describe('Problema 2: el proceso se respeta en la API', () => {
      it('recorre el proceso completo y deja historial', async () => {
        const { folio, status } = await create(userA);
        expect(status).toBe('REGISTERED');

        expect((await act(analyst, folio, 'START', TA)).json().status).toBe('IN_PROGRESS');
        expect((await act(analyst, folio, 'RESOLVE', TA)).json().status).toBe('RESOLVED');
        expect((await act(userA, folio, 'REJECT')).json().status).toBe('IN_PROGRESS');
        expect((await act(analyst, folio, 'RESOLVE', TA)).json().status).toBe('RESOLVED');
        const closed = await act(userA, folio, 'CONFIRM');
        expect(closed.json()).toMatchObject({ status: 'CLOSED', availableActions: [] });

        const history = await call(userA, 'GET', `/api/requests/${folio}/history`);
        expect(history.json().items.map((e: { toStatus: string }) => e.toStatus)).toEqual([
          'REGISTERED', 'IN_PROGRESS', 'RESOLVED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED',
        ]);
      });

      it('un salto de etapa responde 409 con mensaje claro y no cambia la solicitud', async () => {
        const { folio } = await create(userA);
        const res = await act(analyst, folio, 'RESOLVE', TA);

        expect(res.statusCode).toBe(409);
        expect(res.json().error).toEqual({
          code: 'INVALID_TRANSITION',
          message:
            'No se puede resolver una solicitud en estado "Registrada". Esa acción solo aplica a solicitudes en estado "En atención".',
        });
        const after = await call(userA, 'GET', `/api/requests/${folio}`);
        expect(after.json()).toMatchObject({ status: 'REGISTERED', version: 1 });
      });

      it('el analista no puede confirmar la solución en nombre de la filial (403)', async () => {
        const { folio } = await create(userA);
        await act(analyst, folio, 'START', TA);
        await act(analyst, folio, 'RESOLVE', TA);

        const res = await act(analyst, folio, 'CONFIRM', TA);
        expect(res.statusCode).toBe(403);
        expect(res.json().error.code).toBe('ROLE_NOT_ALLOWED');
        expect((await call(userA, 'GET', `/api/requests/${folio}`)).json().status).toBe('RESOLVED');
      });

      it('una solicitud cerrada no admite cambios (409)', async () => {
        const { folio } = await create(userA);
        await act(analyst, folio, 'START', TA);
        await act(analyst, folio, 'RESOLVE', TA);
        await act(userA, folio, 'CONFIRM');

        const res = await act(userA, folio, 'REJECT');
        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe('REQUEST_CLOSED');
      });

      it('dos acciones simultáneas sobre la misma solicitud: solo una se aplica', async () => {
        const { folio } = await create(userA);
        const results = await Promise.all([act(analyst, folio, 'START', TA), act(analyst, folio, 'START', TA)]);

        expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
        const history = await call(userA, 'GET', `/api/requests/${folio}/history`);
        expect(history.json().items).toHaveLength(2);
      });
    });

    describe('Problema 1: consulta y filtros', () => {
      it('filtra por estado y pagina con cursor', async () => {
        const res = await call(userA, 'GET', '/api/requests?status=CLOSED&limit=1');
        const body = res.json<{ items: { status: string }[]; nextCursor: string | null }>();
        expect(res.statusCode).toBe(200);
        expect(body.items).toHaveLength(1);
        expect(body.items[0]?.status).toBe('CLOSED');
        expect(body.nextCursor).toBeTruthy();

        const next = await call(userA, 'GET', `/api/requests?status=CLOSED&limit=1&cursor=${encodeURIComponent(body.nextCursor!)}`);
        expect(next.json().items[0].status).toBe('CLOSED');
      });

      it('una filial sin solicitudes recibe una lista vacía', async () => {
        const empty: Principal = { userId: 'uc', name: 'C', role: 'TENANT_USER', tenantId: TC, tenants: [] };
        tokens.set(empty, await signDevToken(empty, JWT_SECRET, ISSUER));
        const res = await call(empty, 'GET', '/api/requests');
        expect(res.json()).toEqual({ items: [], nextCursor: null });
      });

      it('valida los parámetros con mensajes claros', async () => {
        const res = await call(userA, 'GET', '/api/requests?status=ABIERTA');
        expect(res.statusCode).toBe(400);
        expect(res.json().error.message).toContain('El estado debe ser uno de');
      });
    });

    describe('identificación', () => {
      it('sin token o con un token inválido responde 401', async () => {
        expect((await call(null, 'GET', '/api/requests')).statusCode).toBe(401);
        const forged = await app.inject({
          method: 'GET',
          url: '/api/requests',
          headers: { authorization: `Bearer ${await signDevToken(userA, 'otro-secreto-cualquiera-123456', ISSUER)}` },
        });
        expect(forged.statusCode).toBe(401);
      });

      it('/api/me devuelve el usuario y sus filiales', async () => {
        const res = await call(analyst, 'GET', '/api/me');
        expect(res.json()).toMatchObject({ role: 'ANALYST', tenants: [{ id: TA }, { id: TB }] });
      });
    });
  });
}
