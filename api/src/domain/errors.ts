export type ErrorKind = 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'BAD_REQUEST' | 'UNAUTHENTICATED';

export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly kind: ErrorKind;
}

export class RequestNotFoundError extends AppError {
  readonly code = 'REQUEST_NOT_FOUND';
  readonly kind = 'NOT_FOUND';
  constructor() {
    super('La solicitud no existe.');
  }
}

export class RequestClosedError extends AppError {
  readonly code = 'REQUEST_CLOSED';
  readonly kind = 'CONFLICT';
  constructor(folio: string) {
    super(`La solicitud ${folio} está cerrada y no admite cambios.`);
  }
}

export class InvalidTransitionError extends AppError {
  readonly code = 'INVALID_TRANSITION';
  readonly kind = 'CONFLICT';
}

export class RoleNotAllowedError extends AppError {
  readonly code = 'ROLE_NOT_ALLOWED';
  readonly kind = 'FORBIDDEN';
}

export class ConcurrentModificationError extends AppError {
  readonly code = 'CONCURRENT_MODIFICATION';
  readonly kind = 'CONFLICT';
  constructor(folio: string) {
    super(
      `La solicitud ${folio} cambió mientras procesabas la acción. Consulta su estado actual e inténtalo de nuevo.`,
    );
  }
}

export class TenantNotAssignedError extends AppError {
  readonly code = 'TENANT_NOT_ASSIGNED';
  readonly kind = 'FORBIDDEN';
  constructor(tenantId: string) {
    super(`No tienes asignada la filial "${tenantId}".`);
  }
}

export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
  readonly kind = 'BAD_REQUEST';
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export class UnauthenticatedError extends AppError {
  readonly code = 'UNAUTHENTICATED';
  readonly kind = 'UNAUTHENTICATED';
  constructor(message = 'Debes identificarte para usar la Mesa de Solicitudes.') {
    super(message);
  }
}
