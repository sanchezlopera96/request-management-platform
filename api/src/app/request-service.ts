import {
  FOLIO_PATTERN,
  formatFolio,
  type Action,
  type Category,
  type RequestEvent,
  type ServiceRequest,
  type Status,
} from '../domain/request.js';
import { INITIAL_STATUS, availableActions, transition } from '../domain/state-machine.js';
import { RequestNotFoundError, ValidationError } from '../domain/errors.js';
import { resolveTenantScope, type Principal } from './identity.js';
import type { PageKey, RequestRepository } from './ports.js';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface RequestView extends ServiceRequest {
  availableActions: Action[];
}

export interface ListInput {
  tenantId?: string;
  status?: Status;
  limit?: number;
  cursor?: string;
}

export interface ListOutput {
  items: RequestView[];
  nextCursor: string | null;
}

export interface CreateInput {
  subject: string;
  description: string;
  category: Category;
}

function encodeCursor(key: PageKey): string {
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

function decodeCursor(cursor: string): PageKey {
  let key: unknown;
  try {
    key = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    key = null;
  }
  if (typeof key !== 'object' || key === null) {
    throw new ValidationError('El cursor de paginación no es válido. Vuelve a consultar desde la primera página.');
  }
  return key as PageKey;
}

export class RequestService {
  constructor(
    private readonly repository: RequestRepository,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(principal: Principal, input: ListInput = {}): Promise<ListOutput> {
    const tenantId = resolveTenantScope(principal, input.tenantId);
    const limit = Math.min(Math.max(input.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const startKey = input.cursor ? decodeCursor(input.cursor) : undefined;

    const page = await this.repository.list(tenantId, { status: input.status, limit, startKey });

    return {
      items: page.items.map((request) => this.toView(request, principal)),
      nextCursor: page.lastKey ? encodeCursor(page.lastKey) : null,
    };
  }

  async get(principal: Principal, folio: string, requestedTenantId?: string): Promise<RequestView> {
    const tenantId = resolveTenantScope(principal, requestedTenantId);
    const request = await this.load(tenantId, folio);
    return this.toView(request, principal);
  }

  async create(principal: Principal, input: CreateInput, requestedTenantId?: string): Promise<RequestView> {
    const tenantId = resolveTenantScope(principal, requestedTenantId);
    const now = this.clock().toISOString();
    const folio = formatFolio(await this.repository.nextSequence(tenantId));

    const request: ServiceRequest = {
      tenantId,
      folio,
      subject: input.subject,
      description: input.description,
      category: input.category,
      status: INITIAL_STATUS,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: principal.userId,
    };
    const event: RequestEvent = {
      tenantId,
      folio,
      version: 1,
      action: 'CREATE',
      fromStatus: null,
      toStatus: INITIAL_STATUS,
      actorId: principal.userId,
      actorRole: principal.role,
      at: now,
    };

    await this.repository.create(request, event);
    return this.toView(request, principal);
  }

  async applyAction(
    principal: Principal,
    folio: string,
    action: Action,
    options: { comment?: string; tenantId?: string } = {},
  ): Promise<RequestView> {
    const tenantId = resolveTenantScope(principal, options.tenantId);
    const current = await this.load(tenantId, folio);

    const nextStatus = transition(current.status, action, principal.role, current.folio);

    const now = this.clock().toISOString();
    const updated: ServiceRequest = {
      ...current,
      status: nextStatus,
      version: current.version + 1,
      updatedAt: now,
    };
    const event: RequestEvent = {
      tenantId,
      folio: current.folio,
      version: updated.version,
      action,
      fromStatus: current.status,
      toStatus: nextStatus,
      actorId: principal.userId,
      actorRole: principal.role,
      ...(options.comment ? { comment: options.comment } : {}),
      at: now,
    };

    await this.repository.saveTransition(updated, current.version, event);
    return this.toView(updated, principal);
  }

  async history(principal: Principal, folio: string, requestedTenantId?: string): Promise<RequestEvent[]> {
    const tenantId = resolveTenantScope(principal, requestedTenantId);
    await this.load(tenantId, folio);
    return this.repository.listEvents(tenantId, folio);
  }

  private async load(tenantId: string, folio: string): Promise<ServiceRequest> {
    const normalized = folio.trim().toUpperCase();
    if (!FOLIO_PATTERN.test(normalized)) {
      throw new RequestNotFoundError();
    }
    const request = await this.repository.findByFolio(tenantId, normalized);
    if (!request) {
      throw new RequestNotFoundError();
    }
    return request;
  }

  private toView(request: ServiceRequest, principal: Principal): RequestView {
    return { ...request, availableActions: availableActions(request.status, principal.role) };
  }
}
