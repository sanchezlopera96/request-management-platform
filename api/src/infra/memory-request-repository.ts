import type { RequestEvent, ServiceRequest } from '../domain/request.js';
import { ConcurrentModificationError } from '../domain/errors.js';
import type { ListQuery, Page, RequestRepository } from '../app/ports.js';

export class InMemoryRequestRepository implements RequestRepository {
  private readonly requests = new Map<string, ServiceRequest>();
  private readonly events = new Map<string, RequestEvent[]>();
  private readonly counters = new Map<string, number>();

  async nextSequence(tenantId: string): Promise<number> {
    const next = (this.counters.get(tenantId) ?? 0) + 1;
    this.counters.set(tenantId, next);
    return next;
  }

  async create(request: ServiceRequest, event: RequestEvent): Promise<void> {
    const key = this.key(request.tenantId, request.folio);
    if (this.requests.has(key)) {
      throw new ConcurrentModificationError(request.folio);
    }
    this.requests.set(key, structuredClone(request));
    this.events.set(key, [structuredClone(event)]);
  }

  async findByFolio(tenantId: string, folio: string): Promise<ServiceRequest | null> {
    const found = this.requests.get(this.key(tenantId, folio));
    return found ? structuredClone(found) : null;
  }

  async list(tenantId: string, query: ListQuery): Promise<Page<ServiceRequest>> {
    const sorted = [...this.requests.values()]
      .filter((r) => r.tenantId === tenantId && (!query.status || r.status === query.status))
      .sort((a, b) => b.folio.localeCompare(a.folio));

    const afterFolio = query.startKey?.['folio'];
    const start = typeof afterFolio === 'string' ? sorted.findIndex((r) => r.folio < afterFolio) : 0;
    const items = start === -1 ? [] : sorted.slice(start, start + query.limit);

    const last = items.at(-1);
    const hasMore = start !== -1 && start + query.limit < sorted.length;
    return {
      items: items.map((r) => structuredClone(r)),
      ...(hasMore && last ? { lastKey: { folio: last.folio } } : {}),
    };
  }

  async saveTransition(updated: ServiceRequest, expectedVersion: number, event: RequestEvent): Promise<void> {
    const key = this.key(updated.tenantId, updated.folio);
    const current = this.requests.get(key);
    if (!current || current.version !== expectedVersion) {
      throw new ConcurrentModificationError(updated.folio);
    }
    this.requests.set(key, structuredClone(updated));
    this.events.get(key)?.push(structuredClone(event));
  }

  async listEvents(tenantId: string, folio: string): Promise<RequestEvent[]> {
    return structuredClone(this.events.get(this.key(tenantId, folio)) ?? []);
  }

  private key(tenantId: string, folio: string): string {
    return `${tenantId}|${folio}`;
  }
}
