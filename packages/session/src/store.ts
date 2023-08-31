export interface SessionStore {
  set(id: string, session: any): Promise<void>;
  get(id: string): Promise<any>;
  destroy(id: string): Promise<void>;
}
