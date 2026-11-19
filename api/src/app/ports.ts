import type { RequestEvent, ServiceRequest, Status } from '../domain/request.js';

export type PageKey = Record<string, unknown>;

export interface ListQuery {
  status?: Status;
  limit: number;
  startKey?: PageKey;
}

export interface Page<T> {
  items: T[];
  lastKey?: PageKey;
}

export interface RequestRepository {
  nextSequence(tenantId: string): Promise<number>;
  create(request: ServiceRequest, event: RequestEvent): Promise<void>;
  findByFolio(tenantId: string, folio: string): Promise<ServiceRequest | null>;
  list(tenantId: string, query: ListQuery): Promise<Page<ServiceRequest>>;
  saveTransition(updated: ServiceRequest, expectedVersion: number, event: RequestEvent): Promise<void>;
  listEvents(tenantId: string, folio: string): Promise<RequestEvent[]>;
}
