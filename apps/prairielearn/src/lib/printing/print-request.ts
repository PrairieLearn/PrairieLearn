import type { Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';

// Leave time for cleanup and the error response before the load balancer's 60-second limit.
const PRINT_REQUEST_TIMEOUT_MS = 45_000;

/**
 * Shares one deadline across preparation and rendering, including time spent in either queue.
 * Work also stops when the client disconnects, e.g. when a preview reloads after a layout change.
 */
export function startPrintRequest(res: Response) {
  const deadline = Date.now() + PRINT_REQUEST_TIMEOUT_MS;
  const disconnect = new AbortController();
  const timeout = new AbortController();
  const timer = setTimeout(
    () =>
      timeout.abort(
        new HttpStatusError(504, 'Printing took too long. Try again or select fewer questions.'),
      ),
    PRINT_REQUEST_TIMEOUT_MS,
  );
  res.once('close', () => {
    clearTimeout(timer);
    if (!res.writableFinished) {
      disconnect.abort(new Error('The print request was disconnected'));
    }
  });
  return {
    /** Stops question preparation at the deadline or when the client disconnects. */
    signal: AbortSignal.any([disconnect.signal, timeout.signal]),
    /**
     * Cancels rendering when the client disconnects. Renders enforce the deadline themselves via
     * `remainingTimeoutMs()`, so a render that hangs at the deadline can discard its browser.
     */
    disconnectSignal: disconnect.signal,
    remainingTimeoutMs: () => Math.max(1, deadline - Date.now()),
  };
}
