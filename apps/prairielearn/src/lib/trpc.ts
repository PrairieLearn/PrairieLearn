import type { ProcedureType, TRPCError } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import type { Request } from 'express';

import { generateErrorId } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import * as Sentry from '@prairielearn/sentry';

/**
 * Reimplements error handling from `pages/error/error.ts` for tRPC errors.
 * This is necessary because tRPC errors aren't propagated to all the Express
 * error handling machinery.
 */
export function handleTrpcError(opts: {
  error: TRPCError;
  type: ProcedureType | 'unknown';
  req: Request;
}) {
  const errorId = opts.req.res?.locals.error_id ?? generateErrorId();
  if (opts.req.res) opts.req.res.locals.error_id = errorId;

  const code = getHTTPStatusCodeFromError(opts.error);
  if (code >= 500) {
    Sentry.captureException(opts.error, { tags: { error_id: errorId } });
  }

  logger[code >= 500 ? 'error' : 'verbose']('tRPC error', {
    err: opts.error,
    id: errorId,
    status: code,
    url: opts.req.originalUrl,
    response_id: opts.req.res?.locals.response_id ?? null,
  });
}
