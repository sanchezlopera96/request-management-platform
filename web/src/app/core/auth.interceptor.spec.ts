import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { Me } from './models';
import { SessionService } from './session.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let session: SessionService;

  const tenantUser: Me = { userId: 'carlos', name: 'Carlos', role: 'TENANT_USER', tenants: [{ id: 'caribe', name: 'Caribe' }] };
  const analyst: Me = {
    userId: 'sofia',
    name: 'Sofía',
    role: 'ANALYST',
    tenants: [
      { id: 'andina', name: 'Andina' },
      { id: 'caribe', name: 'Caribe' },
    ],
  };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionService);
  });

  afterEach(() => controller.verify());

  it('sin sesión no envía credenciales', () => {
    http.get('/api/dev/users').subscribe();
    const req = controller.expectOne('/api/dev/users');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush([]);
  });

  it('adjunta el token y nunca envía filial para un usuario de filial', () => {
    session.token.set('token-carlos');
    session.me.set(tenantUser);
    session.activeTenantId.set('andina');

    http.get('/api/requests').subscribe();
    const req = controller.expectOne('/api/requests');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-carlos');
    expect(req.request.headers.has('X-Tenant-Id')).toBeFalse();
    req.flush({ items: [], nextCursor: null });
  });

  it('para un analista envía la filial con la que está trabajando', () => {
    session.token.set('token-sofia');
    session.me.set(analyst);
    session.selectTenant('caribe');

    http.get('/api/requests').subscribe();
    const req = controller.expectOne('/api/requests');
    expect(req.request.headers.get('X-Tenant-Id')).toBe('caribe');
    req.flush({ items: [], nextCursor: null });
  });
});
