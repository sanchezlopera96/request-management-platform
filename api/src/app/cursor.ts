import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Status } from '../domain/request.js';
import { InvalidCursorError } from '../domain/errors.js';
import type { PageKey } from './ports.js';

interface CursorPayload {
  t: string;
  s: Status | null;
  k: PageKey;
}

export class CursorCodec {
  constructor(private readonly secret: string) {
    if (secret.length < 16) {
      throw new Error('CURSOR_SECRET debe tener al menos 16 caracteres');
    }
  }

  encode(tenantId: string, status: Status | undefined, key: PageKey): string {
    const payload: CursorPayload = { t: tenantId, s: status ?? null, k: key };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  decode(cursor: string, tenantId: string, status: Status | undefined): PageKey {
    const [body, signature, ...rest] = cursor.split('.');
    if (!body || !signature || rest.length > 0) {
      throw new InvalidCursorError();
    }

    const expected = Buffer.from(this.sign(body));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new InvalidCursorError();
    }

    let payload: CursorPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CursorPayload;
    } catch {
      throw new InvalidCursorError();
    }

    if (payload.t !== tenantId || payload.s !== (status ?? null) || typeof payload.k !== 'object') {
      throw new InvalidCursorError();
    }
    return payload.k;
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
