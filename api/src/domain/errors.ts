export type ErrorKind = 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN';

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
