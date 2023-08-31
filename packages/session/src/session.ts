import type { Request } from 'express';
import { sync as uidSync } from 'uid-safe';
import crypto from 'node:crypto';

import type { SessionStore } from './store';

export interface Session {
  id: string;
  destroy(): Promise<void>;
  regenerate(): Promise<void>;
  [key: string]: any;
}

export function generateSessionId(): string {
  return uidSync(24);
}

export async function loadSession(
  sessionId: string,
  req: Request,
  store: SessionStore,
): Promise<Session> {
  const session = makeSession(sessionId, req, store);

  // Copy session data into the session object.
  const sessionData = await store.get(sessionId);
  if (typeof sessionData === 'object' && sessionData != null) {
    for (const prop in sessionData) {
      if (!(prop in session)) {
        session[prop] = sessionData[prop];
      }
    }
  }

  return session;
}

export function makeSession(sessionId: string, req: Request, store: SessionStore): Session {
  const session = {};

  defineStaticProperty<Session['id']>(session, 'id', sessionId);

  defineStaticProperty<Session['destroy']>(session, 'destroy', async () => {
    delete (req as any).session;
    await store.destroy(sessionId);
  });

  defineStaticProperty<Session['regenerate']>(session, 'regenerate', async () => {
    await store.destroy(sessionId);
    req.session = makeSession(generateSessionId(), req, store);
  });

  return session as Session;
}

export function hashSession(session: Session): string {
  const str = JSON.stringify(session, function (key, val) {
    // ignore cookie property on the root object
    if (this === session && key === 'cookie') {
      return;
    }

    return val;
  });

  // hash
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
