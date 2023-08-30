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

    this.sessions.set(id, session);
  }

  async get(id: string): Promise<any> {
    if (this.options.delay) {
      await sleep(this.options.delay);
    }

    return this.sessions.get(id);
  }
}
