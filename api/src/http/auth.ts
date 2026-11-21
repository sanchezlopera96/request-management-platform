import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { ROLES, type Role } from '../domain/request.js';
import { UnauthenticatedError } from '../domain/errors.js';
import type { Principal } from '../app/identity.js';

export interface TokenVerifier {
  verify(token: string): Promise<Principal>;
}

function claim(payload: JWTPayload, name: string): unknown {
  return payload[name] ?? payload[`custom:${name}`];
}

function tenantList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((t): t is string => typeof t === 'string');
  if (typeof value === 'string') return value.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}

export function claimsToPrincipal(payload: JWTPayload): Principal {
  const role = claim(payload, 'role');
  const tenantId = claim(payload, 'tenantId');

  if (typeof role !== 'string' || !ROLES.includes(role as Role)) {
    throw new UnauthenticatedError('El token no indica un rol válido.');
  }
  if (role === 'TENANT_USER' && (typeof tenantId !== 'string' || tenantId.length === 0)) {
    throw new UnauthenticatedError('El token de un usuario de filial debe indicar su filial.');
  }
  if (!payload.sub) {
    throw new UnauthenticatedError('El token no identifica al usuario.');
  }

  return {
    userId: payload.sub,
    name: typeof payload['name'] === 'string' ? payload['name'] : payload.sub,
    role: role as Role,
    ...(role === 'TENANT_USER' ? { tenantId: tenantId as string } : {}),
    tenants: role === 'ANALYST' ? tenantList(claim(payload, 'tenants')) : [],
  };
}

async function verifyWith(verify: () => Promise<{ payload: JWTPayload }>): Promise<Principal> {
  let payload: JWTPayload;
  try {
    ({ payload } = await verify());
  } catch {
    throw new UnauthenticatedError('Tu sesión no es válida o expiró. Vuelve a identificarte.');
  }
  return claimsToPrincipal(payload);
}

export function createHmacVerifier(secret: string, issuer: string): TokenVerifier {
  const key = new TextEncoder().encode(secret);
  return {
    verify: (token) => verifyWith(() => jwtVerify(token, key, { issuer, algorithms: ['HS256'] })),
  };
}

export function createJwksVerifier(jwksUrl: string, issuer: string, audience?: string): TokenVerifier {
  const jwks = createRemoteJWKSet(new URL(jwksUrl));
  return {
    verify: (token) =>
      verifyWith(() => jwtVerify(token, jwks, { issuer, algorithms: ['RS256'], ...(audience ? { audience } : {}) })),
  };
}

export async function signDevToken(user: Principal, secret: string, issuer: string): Promise<string> {
  return new SignJWT({
    name: user.name,
    role: user.role,
    ...(user.tenantId ? { tenantId: user.tenantId } : {}),
    tenants: user.tenants,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.userId)
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(new TextEncoder().encode(secret));
}
