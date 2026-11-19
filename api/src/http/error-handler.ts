import type { FastifyError, FastifyInstance } from 'fastify';
import { AppError, ValidationError, type ErrorKind } from '../domain/errors.js';

const STATUS_BY_KIND: Record<ErrorKind, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    if (error instanceof AppError) {
      const body: ErrorBody = { error: { code: error.code, message: error.message } };
      if (error instanceof ValidationError && error.details) body.error.details = error.details;
      return reply.status(STATUS_BY_KIND[error.kind]).send(body);
    }

    const statusCode = 'statusCode' in error ? error.statusCode : undefined;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({
        error: { code: 'BAD_REQUEST', message: 'La petición no es válida. Revisa el formato del cuerpo y los parámetros.' },
      } satisfies ErrorBody);
    }

    request.log.error({ err: error }, 'Error no controlado');
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado. Inténtalo de nuevo en unos minutos.' },
    } satisfies ErrorBody);
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: { code: 'ROUTE_NOT_FOUND', message: 'La ruta no existe.' } } satisfies ErrorBody),
  );
}
