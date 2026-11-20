import { type IncomingMessage, ServerResponse } from 'node:http';

import { logger } from '@prairielearn/logger';

/**
 * Creates a response for an upgrade request so that it can be sent through
 * Express like an ordinary HTTP request. Node hands upgrade sockets to us
 * without managing their HTTP response lifecycle, so if Express responds
 * instead of upgrading (e.g. authz fails), the socket is closed once that
 * response is written. Successful upgrades must detach the response before
 * handing the socket to a proxy.
 *
 * Returns `null` and destroys the socket if the upgrade can't be handled.
 */
export function createUpgradeResponse(req: IncomingMessage): ServerResponse | null {
  // Node removes its own `error` listener before emitting `upgrade`, so a client reset
  // while Express authorizes the request (or after it responds) would otherwise be an
  // uncaught exception. The socket destroys itself after emitting the error. This stays
  // attached after a proxy takes over, which adds its own listeners.
  req.socket.on('error', (err) => logger.verbose('Upgrade socket error', err));
  const res = new ServerResponse(req);
  try {
    res.assignSocket(req.socket);
  } catch (err: any) {
    // A client can pipeline an upgrade request behind an ordinary request on
    // the same keep-alive connection. Node emits the upgrade while the earlier
    // response still owns the socket, and browsers never do this.
    if (err.code !== 'ERR_HTTP_SOCKET_ASSIGNED') throw err;
    req.socket.destroy();
    return null;
  }
  res.shouldKeepAlive = false;
  res.once('finish', () => req.socket.end());
  return res;
}
