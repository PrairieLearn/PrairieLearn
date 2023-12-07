import type { Request } from 'express';
import uid from 'uid-safe';
import crypto from 'node:crypto';

import type { SessionStore } from './store';

export interface Session {
  id: string;
  destroy(): Promise<void>;
  regenerate(): Promise<void>;
  setExpiration(expiry: Date | number): void;
  getExpirationDate(): Date;
  [key: string]: any;
}

export async function generateSessionId(): Promise<string> {
  return await uid(24);
}

export async function loadSession(
  sessionId: string,
  req: Request,
  store: SessionStore,
  maxAge: number,
): Promise<Session> {
  const sessionStoreData = await store.get(sessionId);
  const expiresAt = sessionStoreData?.expiresAt ?? null;

  const session = makeSession(sessionId, req, store, expiresAt, maxAge);

  if (sessionStoreData == null) {
    // Immediately persis the new session to the store so that it's assigned
    // an ID and available to query later on in the same request.
    await store.set(
      sessionId,
      session,
      // Cookies only support second-level resolution. To ensure consistency
      // between the cookie and the store, truncate the expiration date to
      // the nearest second.
      truncateExpirationDate(session.getExpirationDate()),
    );
  }

  // Copy session data into the session object.
  if (sessionStoreData != null) {
    const { data } = sessionStoreData;
    for (const prop in data) {
      if (!(prop in session)) {
        session[prop] = data[prop];
      }
    }
  }

  return session;
}

export function makeSession(
  sessionId: string,
  req: Request,
  store: SessionStore,
  expirationDate: Date | null,
  maxAge: number,
): Session {
  const session = {};

  let expiresAt = expirationDate;

  defineStaticProperty<Session['id']>(session, 'id', sessionId);

  defineStaticProperty<Session['destroy']>(session, 'destroy', async () => {
    delete (req as any).session;
    await store.destroy(sessionId);
  });

  defineStaticProperty<Session['regenerate']>(session, 'regenerate', async () => {
    await store.destroy(sessionId);
    req.session = makeSession(await generateSessionId(), req, store, null, maxAge);
  });

  defineStaticProperty<Session['getExpirationDate']>(session, 'getExpirationDate', () => {
    if (expiresAt == null) {
      expiresAt = new Date(Date.now() + maxAge);
    }
    return expiresAt;
  });

  defineStaticProperty<Session['setExpiration']>(session, 'setExpiration', (expiration) => {
    if (typeof expiration === 'number') {
      expiresAt = new Date(Date.now() + expiration);
    } else {
      expiresAt = expiration;
    }
  });

  return session as Session;
}

export function hashSession(session: Session): string {
  const str = JSON.stringify(session);
  return crypto.createHash('sha1').update(str, 'utf8').digest('hex');
}

function defineStaticProperty<T>(obj: object, name: string, fn: T) {
  Object.defineProperty(obj, name, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: fn,
  });
}

export function truncateExpirationDate(date: Date) {
  const time = date.getTime();
  const truncatedTime = Math.floor(time / 1000) * 1000;
  return new Date(truncatedTime);
}
