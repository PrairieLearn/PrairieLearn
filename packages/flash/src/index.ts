import { AsyncLocalStorage } from 'node:async_hooks';
import { Request, Response, NextFunction } from 'express';

const als = new AsyncLocalStorage<FlashStorage>();

export interface FlashMessage {
  type: string;
  message: string;
}

export function flashMiddleware() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const flashStorage = makeFlashStorage(req);
    als.run(flashStorage, () => next());
  };
}

export function flash(): FlashMessage[];
export function flash(type: string): string | null;
export function flash(type: string[]): FlashMessage[];
export function flash(type: string, message: string): void;
export function flash(type?: string | string[], message?: string) {
  const flashStorage = als.getStore();
  if (!flashStorage) {
    throw new Error('flash() must be called within a request');
  }

  if (Array.isArray(type)) {
    const messages = type
      .map((type) => {
        const flash = flashStorage.get(type);
        if (flash == null) return null;
        return {
          type,
          message: flash,
        };
      })
      .filter((message): message is FlashMessage => message != null);
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
  add(type: string, message: string): void;
  get(type: string): string | null;
  getAll(): FlashMessage[];
  clear(type: string): void;
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
