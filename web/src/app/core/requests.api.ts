import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Action, Page, RequestEvent, ServiceRequest, Status } from './models';

export const PAGE_SIZE = 25;

@Injectable({ providedIn: 'root' })
export class RequestsApi {
  private readonly http = inject(HttpClient);

  list(query: { status?: Status | null; cursor?: string | null }): Observable<Page<ServiceRequest>> {
    let params = new HttpParams().set('limit', PAGE_SIZE);
    if (query.status) params = params.set('status', query.status);
    if (query.cursor) params = params.set('cursor', query.cursor);
    return this.http.get<Page<ServiceRequest>>('/api/requests', { params });
  }

  get(folio: string): Observable<ServiceRequest> {
    return this.http.get<ServiceRequest>(`/api/requests/${encodeURIComponent(folio)}`);
  }

  history(folio: string): Observable<RequestEvent[]> {
    return this.http
      .get<{ items: RequestEvent[] }>(`/api/requests/${encodeURIComponent(folio)}/history`)
      .pipe(map((res) => res.items));
  }

  act(folio: string, action: Action): Observable<ServiceRequest> {
    return this.http.post<ServiceRequest>(`/api/requests/${encodeURIComponent(folio)}/actions`, { action });
  }
}
