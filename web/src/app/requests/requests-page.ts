import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { RequestsApi } from '../core/requests.api';
import { SessionService } from '../core/session.service';
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  STATUSES,
  ServiceRequest,
  Status,
  errorCode,
  errorMessage,
  normalizeFolio,
} from '../core/models';
import { RequestDetail } from './request-detail';

type Phase = 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-requests-page',
  imports: [DatePipe, RequestDetail],
  templateUrl: './requests-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestsPage {
  private readonly api = inject(RequestsApi);
  protected readonly session = inject(SessionService);

  protected readonly statuses = STATUSES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly categoryLabels = CATEGORY_LABELS;

  private readonly scope = computed(() => `${this.session.me()?.userId}|${this.session.activeTenantId()}`);

  protected readonly status = linkedSignal<string, Status | null>({ source: this.scope, computation: () => null });
  protected readonly items = signal<ServiceRequest[]>([]);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly phase = signal<Phase>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly loadingMore = signal(false);
  protected readonly loadMoreError = signal<string | null>(null);

  protected readonly selected = linkedSignal<string, ServiceRequest | null>({ source: this.scope, computation: () => null });
  protected readonly searchText = signal('');
  protected readonly searching = signal(false);
  protected readonly searchMessage = linkedSignal<string, string | null>({ source: this.scope, computation: () => null });

  protected readonly emptyMessage = computed(() => {
    const status = this.status();
    return status
      ? `No hay solicitudes en estado "${STATUS_LABELS[status]}".`
      : 'Aún no hay solicitudes registradas para esta filial.';
  });

  private listSubscription?: Subscription;

  constructor() {
    effect(() => {
      this.scope();
      const status = this.status();
      untracked(() => this.reload(status));
    });
  }

  protected setStatus(status: Status | null): void {
    this.status.set(status);
  }

  protected reload(status = this.status()): void {
    this.listSubscription?.unsubscribe();
    this.phase.set('loading');
    this.error.set(null);
    this.loadMoreError.set(null);
    this.listSubscription = this.api.list({ status }).subscribe({
      next: (page) => {
        this.items.set(page.items);
        this.nextCursor.set(page.nextCursor);
        this.phase.set('ready');
      },
      error: (err) => {
        this.items.set([]);
        this.nextCursor.set(null);
        this.error.set(errorMessage(err));
        this.phase.set('error');
      },
    });
  }

  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (!cursor || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.loadMoreError.set(null);
    this.listSubscription = this.api.list({ status: this.status(), cursor }).subscribe({
      next: (page) => {
        this.items.update((items) => [...items, ...page.items]);
        this.nextCursor.set(page.nextCursor);
        this.loadingMore.set(false);
      },
      error: (err) => {
        this.loadMoreError.set(errorMessage(err));
        this.loadingMore.set(false);
      },
    });
  }

  protected search(event: Event): void {
    event.preventDefault();
    const folio = normalizeFolio(this.searchText());
    if (!folio) {
      this.searchMessage.set('Escribe un folio válido, por ejemplo SOL-000123 o simplemente 123.');
      return;
    }
    this.searching.set(true);
    this.searchMessage.set(null);
    this.api.get(folio).subscribe({
      next: (request) => {
        this.selected.set(request);
        this.searching.set(false);
      },
      error: (err) => {
        this.searchMessage.set(
          errorCode(err) === 'REQUEST_NOT_FOUND'
            ? `No encontramos la solicitud ${folio} entre las de esta filial.`
            : errorMessage(err),
        );
        this.searching.set(false);
      },
    });
  }

  protected onSearchInput(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
    this.searchMessage.set(null);
  }

  protected onUpdated(updated: ServiceRequest): void {
    this.selected.set(updated);
    const filter = this.status();
    this.items.update((items) =>
      items
        .map((r) => (r.folio === updated.folio ? updated : r))
        .filter((r) => !filter || r.status === filter),
    );
  }
}
