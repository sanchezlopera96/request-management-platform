import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { SessionService } from './core/session.service';
import { DemoUser, ROLE_LABELS, errorMessage } from './core/models';
import { RequestsPage } from './requests/requests-page';

@Component({
  selector: 'app-root',
  imports: [RequestsPage],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  protected readonly session = inject(SessionService);
  protected readonly roleLabels = ROLE_LABELS;

  protected readonly users = signal<DemoUser[]>([]);
  protected readonly ready = signal(false);
  protected readonly signingIn = signal(false);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      await this.session.restore();
      this.users.set(await this.session.listUsers());
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.ready.set(true);
    }
  }

  protected async signIn(userId: string): Promise<void> {
    if (!userId) return;
    this.signingIn.set(true);
    this.error.set(null);
    try {
      await this.session.signIn(userId);
    } catch (err) {
      this.error.set(errorMessage(err));
    } finally {
      this.signingIn.set(false);
    }
  }

  protected onUserChange(event: Event): void {
    void this.signIn((event.target as HTMLSelectElement).value);
  }

  protected onTenantChange(event: Event): void {
    this.session.selectTenant((event.target as HTMLSelectElement).value);
  }

  protected retry(): void {
    this.ready.set(false);
    this.error.set(null);
    void this.ngOnInit();
  }
}
