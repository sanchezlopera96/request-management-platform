import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceRequest } from '../core/models';
import { RequestsPage } from './requests-page';

function request(folio: string, status: ServiceRequest['status'] = 'REGISTERED'): ServiceRequest {
  return {
    tenantId: 'andina',
    folio,
    subject: `Asunto ${folio}`,
    description: 'Detalle',
    category: 'PAYROLL',
    status,
    version: 1,
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
    createdBy: 'laura',
    availableActions: [],
  };
}

describe('RequestsPage', () => {
  let fixture: ComponentFixture<RequestsPage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RequestsPage],
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(RequestsPage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  const respondList = async (items: ServiceRequest[], nextCursor: string | null = null) => {
    http.expectOne((r) => r.url === '/api/requests').flush({ items, nextCursor });
    await fixture.whenStable();
  };

  it('muestra las solicitudes de la filial con su estado', async () => {
    await respondList([request('SOL-000002', 'IN_PROGRESS'), request('SOL-000001', 'CLOSED')], 'cursor-1');

    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('SOL-000002');
    expect(rows[0].textContent).toContain('En atención');
    expect(el.textContent).toContain('Cargar más');
  });

  it('indica con claridad cuando la filial no tiene solicitudes', async () => {
    await respondList([]);
    expect(el.textContent).toContain('Aún no hay solicitudes registradas para esta filial.');
  });

  it('indica con claridad cuando la consulta falla y permite reintentar', async () => {
    http
      .expectOne((r) => r.url === '/api/requests')
      .flush({ error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' } }, { status: 500, statusText: 'Error' });
    await fixture.whenStable();

    expect(el.textContent).toContain('No pudimos cargar las solicitudes');
    const retry = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Reintentar'));
    expect(retry).toBeTruthy();

    retry!.click();
    await respondList([request('SOL-000001')]);
    expect(el.querySelectorAll('tbody tr').length).toBe(1);
  });

  it('filtra por estado consultando el backend', async () => {
    await respondList([request('SOL-000001')]);

    const chip = Array.from(el.querySelectorAll<HTMLButtonElement>('.chip')).find((b) => b.textContent?.includes('Resuelta'));
    chip!.click();
    await fixture.whenStable();

    const req = http.expectOne((r) => r.url === '/api/requests');
    expect(req.request.params.get('status')).toBe('RESOLVED');
    req.flush({ items: [], nextCursor: null });
    await fixture.whenStable();
    expect(el.textContent).toContain('No hay solicitudes en estado "Resuelta".');
  });
});
