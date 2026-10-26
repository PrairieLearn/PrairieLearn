import type { Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';
import { withResolvers } from '@prairielearn/utils';

// Leave time for cleanup and the error response before the load balancer's 60-second limit.
const PRINT_REQUEST_TIMEOUT_MS = 45_000;
const activePrintRequests = new Map<AbortController, Promise<void>>();
let acceptingPrintRequests = true;

export function initPrintRequests(): void {
  acceptingPrintRequests = true;
}

/** Drains the actual work, including callbacks whose HTTP requests have already timed out. */
export async function stopPrintRequests(): Promise<void> {
  acceptingPrintRequests = false;
  const error = new HttpStatusError(503, 'Printing is shutting down. Try again shortly.');
  for (const controller of activePrintRequests.keys()) {
    controller.abort(error);
  }
  await Promise.allSettled(activePrintRequests.values());
}

/** Shares one deadline across preparation and rendering, including time spent in either queue. */
export async function withPrintRequest(
  res: Response,
  callback: (request: { signal: AbortSignal; remainingTimeoutMs: () => number }) => Promise<void>,
): Promise<void> {
  if (!acceptingPrintRequests) {
    throw new HttpStatusError(503, 'Printing is shutting down. Try again shortly.');
  }
  const controller = new AbortController();
  const { signal } = controller;
  const deadline = Date.now() + PRINT_REQUEST_TIMEOUT_MS;
  const timeoutError = new HttpStatusError(
    504,
    'Printing took too long. Try again or select fewer questions.',
  );
  const timeout = setTimeout(() => controller.abort(timeoutError), PRINT_REQUEST_TIMEOUT_MS);
  const remainingTimeoutMs = () => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) controller.abort(timeoutError);
    signal.throwIfAborted();
    return remaining;
  };
  const { promise: aborted, reject } = withResolvers<never>();
  const onAbort = () => reject(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  const onClose = () => {
    if (!res.writableFinished) {
      controller.abort(new Error('The print request was disconnected'));
    }
  };
  res.once('close', onClose);
  if (res.destroyed) onClose();

  const work = async () => {
    remainingTimeoutMs();
    await callback({ signal, remainingTimeoutMs });
  };
  const pendingWork = work().finally(() => {
    activePrintRequests.delete(controller);
  });
  activePrintRequests.set(controller, pendingWork);
  try {
    // Return the timeout response promptly. The work keeps its queue permit until it
    // settles, since an in-flight question or Word packing operation cannot be interrupted.
    await Promise.race([pendingWork, aborted]);
  } catch (error) {
    if (signal.aborted && res.destroyed) return;
    throw error;
  } finally {
    clearTimeout(timeout);
    res.off('close', onClose);
    signal.removeEventListener('abort', onAbort);
  }
}
