import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DemoUser, Me } from './models';

const TOKEN_KEY = 'rd.token';
const TENANT_KEY = 'rd.tenant';

function readStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    return;
  }
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);

  readonly token = signal<string | null>(readStorage(TOKEN_KEY));
  readonly me = signal<Me | null>(null);
  readonly activeTenantId = signal<string | null>(readStorage(TENANT_KEY));

  readonly isAnalyst = computed(() => this.me()?.role === 'ANALYST');
  readonly activeTenant = computed(() => {
    const me = this.me();
    return me?.tenants.find((t) => t.id === this.activeTenantId()) ?? me?.tenants[0] ?? null;
  });

  listUsers(): Promise<DemoUser[]> {
    return firstValueFrom(this.http.get<DemoUser[]>('/api/dev/users'));
  }

  async signIn(userId: string): Promise<void> {
    const { token } = await firstValueFrom(
      this.http.post<{ token: string }>('/api/dev/token', { userId }),
    );
    this.setToken(token);
    await this.loadMe();
    this.selectTenant(this.me()?.tenants[0]?.id ?? null);
  }

  async restore(): Promise<void> {
    if (!this.token()) return;
    try {
      await this.loadMe();
      const me = this.me();
      if (!me?.tenants.some((t) => t.id === this.activeTenantId())) {
        this.selectTenant(me?.tenants[0]?.id ?? null);
      }
    } catch {
      this.signOut();
    }
  }

  selectTenant(tenantId: string | null): void {
    this.activeTenantId.set(tenantId);
    writeStorage(TENANT_KEY, tenantId);
  }

  signOut(): void {
    this.setToken(null);
    this.me.set(null);
    this.selectTenant(null);
  }

  private async loadMe(): Promise<void> {
    this.me.set(await firstValueFrom(this.http.get<Me>('/api/me')));
  }

  private setToken(token: string | null): void {
    this.token.set(token);
    writeStorage(TOKEN_KEY, token);
  }
}
