import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

/**
 * Ensure that the specified properties exist in the given data object.
 * If any property is missing, logs a Sentry error and captures a Sentry exception.
 *
 * @param params
 * @param params.data The data object to check.
 * @param params.props The list of property names to ensure exist in the data object.
 * @param params.socketName The socket name to display in logged error messages,
 * e.g. "socket.io [socketName] connected without [prop]"
 */
export function ensureProps({
  data,
  props,
  socketName,
}: {
  data: Record<string, any>;
  props: string[];
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
