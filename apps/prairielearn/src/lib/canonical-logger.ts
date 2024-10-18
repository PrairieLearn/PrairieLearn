import { AsyncLocalStorage } from 'node:async_hooks';

import { type NextFunction, type Request, type Response } from 'express';

const als = new AsyncLocalStorage<CanonicalLogger>();

export interface ICanonicalLogger {
  append(entries: Record<string, any>): void;
  increment(key: string, value?: number): void;
  data(): Record<string, any>;
}

export class CanonicalLogger implements ICanonicalLogger {
  private _data: Record<string, any> = {};

  append(entries: Record<string, any>) {
    Object.assign(this._data, entries);
  }

  increment(key: string, value = 1) {
    this._data[key] = (this._data[key] || 0) + value;
  }

  data() {
    return this._data;
  }
}

export function getCanonicalLogger(): CanonicalLogger | null {
  return als.getStore() ?? null;
}

export function canonicalLoggerMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const canonicalLogger = new CanonicalLogger();
    als.run(canonicalLogger, () => next());
  };
}

export const canonicalLogger: ICanonicalLogger = {
  append(entries: Record<string, any>) {
    getCanonicalLogger()?.append(entries);
  },
  increment(key: string, value?: number) {
    getCanonicalLogger()?.increment(key, value);
  },
  data() {
    return getCanonicalLogger()?.data() ?? {};
  },
};
