import 'express-session';

declare module 'express-session' {
  interface SessionData {
    flash?: Record<string, string>;
  }
}
