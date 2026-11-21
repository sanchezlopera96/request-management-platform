import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { RequestsApi } from '../core/requests.api';
import {
  ACTION_LABELS,
  Action,
  CATEGORY_LABELS,
  ROLE_LABELS,
  RequestEvent,
  STATUS_LABELS,
  ServiceRequest,
  errorMessage,
} from '../core/models';

@Component({
  selector: 'app-request-detail',
  imports: [DatePipe],
  templateUrl: './request-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestDetail {
  private readonly api = inject(RequestsApi);

  readonly request = input.required<ServiceRequest>();
  readonly updated = output<ServiceRequest>();
  readonly closed = output<void>();

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly actionLabels = ACTION_LABELS;
  protected readonly roleLabels = ROLE_LABELS;

  protected readonly history = signal<RequestEvent[] | null>(null);
  protected readonly historyError = signal<string | null>(null);
  protected readonly acting = signal<Action | null>(null);
  protected readonly actionError = signal<string | null>(null);

  private historySubscription?: Subscription;

  constructor() {
    effect(() => {
      const { folio } = this.request();
      untracked(() => this.loadHistory(folio));
    });
  }

  protected loadHistory(folio = this.request().folio): void {
    this.historySubscription?.unsubscribe();
    this.history.set(null);
    this.historyError.set(null);
    this.historySubscription = this.api.history(folio).subscribe({
      next: (events) => this.history.set([...events].reverse()),
      error: (err) => this.historyError.set(errorMessage(err)),
    });
  }

  protected act(action: Action): void {
    this.acting.set(action);
    this.actionError.set(null);
    this.api.act(this.request().folio, action).subscribe({
      next: (updated) => {
        this.acting.set(null);
        this.updated.emit(updated);
      },
      error: (err) => {
        this.acting.set(null);
        this.actionError.set(errorMessage(err));
      },
    });
  }

}
