import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

export function ensureProps({
  data,
  props,
  socketName,
}: {
  data: Record<string, any>;
  props: string[];
  /**
   * The name of the socket that should be logged. Will be logged as follows:
   * "socket.io [socketName] connected without [prop]"
   */
  socketName: string;
}): boolean {
  for (const prop of props) {
    if (!Object.hasOwn(data, prop)) {
      logger.error(`socket.io ${socketName} connected without ${prop}`);
      Sentry.captureException(
        new Error(`socket.io ${socketName} connected without property ${prop}`),
      );
      return false;
    }
  }
  return true;
}
