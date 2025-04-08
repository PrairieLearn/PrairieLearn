import { AsyncLocalStorage } from 'node:async_hooks';

import type { NextFunction, Request, Response } from 'express';

import { type HtmlSafeString, html } from '@prairielearn/html';

const als = new AsyncLocalStorage<FlashStorage>();

export type FlashMessageType = 'notice' | 'success' | 'warning' | 'error';

export interface FlashMessage {
  type: FlashMessageType;
  message: string;
}

export function flashMiddleware() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const flashStorage = makeFlashStorage(req);
    als.run(flashStorage, () => next());
  };
}

export function flash(type?: FlashMessageType | FlashMessageType[]): FlashMessage[];
export function flash(type: FlashMessageType, message: string | HtmlSafeString): void;
export function flash(
  type?: FlashMessageType | FlashMessageType[],
  message?: string | HtmlSafeString,
) {
  const flashStorage = als.getStore();
  if (!flashStorage) {
    throw new Error('flash() must be called within a request');
  }

  if (Array.isArray(type)) {
    const messages = type.flatMap((type) => flashStorage.get(type));
    type.forEach((t) => flashStorage.clear(t));
    return messages;
  }

  if (type != null && message != null) {
    flashStorage.add(type, message);
    return;
  }

  if (type != null) {
    const message = flashStorage.get(type);
    flashStorage.clear(type);
    return message;
  }

  const messages = flashStorage.getAll();
  flashStorage.clearAll();
  return messages;
}

interface FlashStorage {
  add(type: FlashMessageType, message: string | HtmlSafeString): void;
  get(type: FlashMessageType): FlashMessage[] | null;
  getAll(): FlashMessage[];
  clear(type: FlashMessageType): void;
  clearAll(): void;
}

function makeFlashStorage(req: Request): FlashStorage {
  // The "flash storage" object will be stored in `AsyncLocalStorage` for the
  // request. If we start some async I/O during a request (such as opening a
  // database connection or a socket connection to Docker), that would by
  // default keep the async context, and thus the request. This would prevent
  // the request object (and any data associated with it) from being garbage
  // collected. We use a `WeakRef` to fix this.
  //
  // This should always be safe, as the request object won't be garbage
  // collected until the response has been sent, and we should never be reading
  // or writing flash messages after the response has been sent.
  const reqRef = new WeakRef(req);

  function getSession() {
    const req = reqRef.deref();
    if (!req) throw new Error('Request has been garbage collected');
    const session = (req as any).session;
    if (!session) throw new Error('No session found on request');
    return session;
  }

  return {
    add(type: FlashMessageType, message: string | HtmlSafeString) {
      const session = getSession();
      session.flash ??= [];
      session.flash.push({ type, message: html`${message}`.toString() });
    },
    get(type: FlashMessageType) {
      const session = getSession();
      const messages = session.flash ?? [];
      return messages.filter((message: FlashMessage) => message.type === type);
    },
    getAll() {
      const session = getSession();
      return session.flash ?? [];
    },
    clear(type: FlashMessageType) {
      const session = getSession();
      session.flash = session.flash?.filter((message: FlashMessage) => message.type !== type) ?? [];
    },
    clearAll() {
      const session = getSession();
      session.flash = [];
    },
  } satisfies FlashStorage;
}
