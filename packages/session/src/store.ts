export interface SessionStoreData {
  data: any;
  expiresAt: Date;
}

export interface SessionStore {
  set(id: string, session: any, expiresAt: Date): Promise<void>;
  get(id: string): Promise<SessionStoreData | null>;
  destroy(id: string): Promise<void>;
}
