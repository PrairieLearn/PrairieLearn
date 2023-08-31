import { setTimeout as sleep } from 'node:timers/promises';

import { SessionStore } from './store';

interface MemoryStoreOptions {
  delay?: number;
}

export class MemoryStore implements SessionStore {
  private options: MemoryStoreOptions;
  private sessions = new Map<string, any>();

  constructor(options: MemoryStoreOptions = {}) {
    this.options = options;
  }

  async set(id: string, session: any): Promise<void> {
    if (this.options.delay) {
      await sleep(this.options.delay);
    }

    this.sessions.set(id, JSON.stringify(session));
  }

  async get(id: string): Promise<any> {
    if (this.options.delay) {
      await sleep(this.options.delay);
    }

    const value = this.sessions.get(id);
    return value ? JSON.parse(value) : null;
  }

  async destroy(id: string): Promise<void> {
    this.sessions.delete(id);
  }
}
