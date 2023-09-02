import { setTimeout as sleep } from 'node:timers/promises';

import { SessionStore, SessionStoreData } from './store';

interface MemoryStoreOptions {
  delay?: number;
}

export class MemoryStore implements SessionStore {
  private options: MemoryStoreOptions;
  private sessions = new Map<string, { expiresAt: Date; data: string }>();

  constructor(options: MemoryStoreOptions = {}) {
    this.options = options;
  }

  async set(id: string, session: any, expiresAt: Date): Promise<void> {
    if (this.options.delay) {
      await sleep(this.options.delay);
    }

    this.sessions.set(id, {
      expiresAt,
      data: JSON.stringify(session),
    });
  }

  async get(id: string): Promise<SessionStoreData | null> {
    if (this.options.delay) {
      await sleep(this.options.delay);
    }

    const value = this.sessions.get(id);
    if (!value) return null;
    return {
      expiresAt: value.expiresAt,
      data: JSON.parse(value.data),
    };
  }

  async destroy(id: string): Promise<void> {
    this.sessions.delete(id);
  }
}
