import { SessionStore, SessionStoreData } from './store';

export class MemoryStore implements SessionStore {
  private sessions = new Map<string, { expiresAt: Date; data: string }>();

  async set(id: string, session: any, expiresAt: Date): Promise<void> {
    this.sessions.set(id, {
      expiresAt,
      data: JSON.stringify(session),
    });
  }

  async get(id: string): Promise<SessionStoreData | null> {
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
