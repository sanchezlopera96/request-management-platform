import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { SessionService } from './session.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionService);
  const headers: Record<string, string> = {};

  const token = session.token();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const tenantId = session.activeTenantId();
  if (session.isAnalyst() && tenantId) headers['X-Tenant-Id'] = tenantId;

  return next(req.clone({ setHeaders: headers }));
};
