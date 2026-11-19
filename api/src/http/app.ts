import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import type { RequestService } from '../app/request-service.js';
import type { Principal } from '../app/identity.js';
import { UnauthenticatedError, ValidationError } from '../domain/errors.js';
import { DEMO_USERS, tenantName } from '../config/demo.js';
import { signDevToken, type TokenVerifier } from './auth.js';
import { registerErrorHandling } from './error-handler.js';
import { actionBodySchema, createRequestSchema, devTokenSchema, listQuerySchema, parse } from './schemas.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export interface AppDependencies {
  service: RequestService;
  verifier: TokenVerifier;
  devAuth: { secret: string; issuer: string };
  corsOrigin?: string | boolean;
  logger?: boolean;
}

const TENANT_HEADER = 'x-tenant-id';

function principalOf(request: FastifyRequest): Principal {
  if (!request.principal) throw new UnauthenticatedError();
  return request.principal;
}

function requestedTenant(request: FastifyRequest): string | undefined {
  const value = request.headers[TENANT_HEADER];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger ? { redact: ['req.headers.authorization'] } : false,
  });

  registerErrorHandling(app);
  await app.register(cors, {
    origin: deps.corsOrigin ?? false,
    allowedHeaders: ['authorization', 'content-type', TENANT_HEADER],
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/dev/users', async () =>
    DEMO_USERS.map((u) => ({ userId: u.userId, name: u.name, role: u.role })),
  );

  app.post('/api/dev/token', async (request) => {
    const { userId } = parse(devTokenSchema, request.body);
    const user = DEMO_USERS.find((u) => u.userId === userId);
    if (!user) throw new ValidationError(`No existe el usuario de prueba "${userId}".`);
    return { token: await signDevToken(user, deps.devAuth.secret, deps.devAuth.issuer) };
  });

  await app.register(async (secured) => {
    secured.addHook('onRequest', async (request) => {
      const header = request.headers.authorization;
      if (!header?.startsWith('Bearer ')) throw new UnauthenticatedError();
      request.principal = await deps.verifier.verify(header.slice('Bearer '.length));
    });

    secured.get('/api/me', async (request) => {
      const p = principalOf(request);
      const tenantIds = p.role === 'TENANT_USER' && p.tenantId ? [p.tenantId] : p.tenants;
      return {
        userId: p.userId,
        name: p.name,
        role: p.role,
        tenants: tenantIds.map((id) => ({ id, name: tenantName(id) })),
      };
    });

    secured.get('/api/requests', async (request) => {
      const query = parse(listQuerySchema, request.query);
      return deps.service.list(principalOf(request), { ...query, tenantId: requestedTenant(request) });
    });

    secured.post('/api/requests', async (request, reply) => {
      const input = parse(createRequestSchema, request.body);
      const created = await deps.service.create(principalOf(request), input, requestedTenant(request));
      return reply.status(201).send(created);
    });

    secured.get<{ Params: { folio: string } }>('/api/requests/:folio', async (request) =>
      deps.service.get(principalOf(request), request.params.folio, requestedTenant(request)),
    );

    secured.get<{ Params: { folio: string } }>('/api/requests/:folio/history', async (request) => ({
      items: await deps.service.history(principalOf(request), request.params.folio, requestedTenant(request)),
    }));

    secured.post<{ Params: { folio: string } }>('/api/requests/:folio/actions', async (request) => {
      const { action } = parse(actionBodySchema, request.body);
      return deps.service.applyAction(principalOf(request), request.params.folio, action, {
        tenantId: requestedTenant(request),
      });
    });
  });

  return app;
}
