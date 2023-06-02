import { AsyncLocalStorage } from 'node:async_hooks';
import { Request, Response, NextFunction } from 'express';

const als = new AsyncLocalStorage<FlashStorage>();

export interface FlashMessage {
  type: string;
  message: string;
}

export function flashMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const flashStorage = makeFlashStorage(req);
    als.run(flashStorage, () => next());
  };
}

export function flash(): FlashMessage[];
export function flash(type: string): string | null;
export function flash(type: string, message: string): void;
export function flash(type?: string, message?: string) {
  const flashStorage = als.getStore();
  if (!flashStorage) {
    throw new Error('flash() must be called within a request');
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
  flashStorage.clear();
  return messages;
}

interface FlashStorage {
  add(type: string, message: string): void;
  get(type: string): string | null;
  getAll(): FlashMessage[];
  clear(type?: string): void;
  clearAll(): void;
}

function makeFlashStorage(req: Request): FlashStorage {
  if (!req.session) {
    throw new Error('@prairielearn/flash requires session support');
  }

  const session = req.session as any;

  return {
    add(type: string, message: string) {
      session.flash ??= {};
      session.flash[type] = message;
    },
    get(type: string) {
      return session.flash?.[type] ?? null;
    },
    getAll() {
      const messages = session.flash ?? {};
      return Object.entries<string>(messages).map(([type, message]) => ({ type, message }));
    },
    clear(type: string) {
      delete session.flash?.[type];
    },
    clearAll() {
      session.flash = {};
    },
  } satisfies FlashStorage;
}
