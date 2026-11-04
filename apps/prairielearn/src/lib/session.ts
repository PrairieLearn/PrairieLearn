import type { Session } from '@prairielearn/session';

import { config } from './config.js';

export function extendSessionExpirationIfNeeded(session: Session): boolean {
  const sessionTtl = session.getExpirationDate().getTime() - Date.now();
  if (
    sessionTtl >=
    (config.sessionStoreExpireSeconds - config.sessionStoreAutoExtendThrottleSeconds) * 1000
  ) {
    return false;
  }

  session.setExpiration(config.sessionStoreExpireSeconds * 1000);
  return true;
}
