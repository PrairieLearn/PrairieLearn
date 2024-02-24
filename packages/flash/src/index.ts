import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, NextFunction } from 'express';
import { HtmlSafeString, html } from '@prairielearn/html';

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
  if (!req.session) {
    throw new Error('@prairielearn/flash requires session support');
  }

  const session = req.session as any;

  return {
    add(type: FlashMessageType, message: string | HtmlSafeString) {
      session.flash ??= [];
      session.flash.push({ type, message: html`${message}`.toString() });
    },
    get(type: FlashMessageType) {
      const messages = session.flash ?? [];
      return messages.filter((message: FlashMessage) => message.type === type);
    },
    getAll() {
      return session.flash ?? [];
    },
    clear(type: FlashMessageType) {
      session.flash = session.flash?.filter((message: FlashMessage) => message.type !== type) ?? [];
    },
    clearAll() {
      session.flash = [];
    },
  } satisfies FlashStorage;
}
