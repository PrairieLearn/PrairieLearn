import type { ProcedureType, TRPCError } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import { sampleSize } from 'es-toolkit';
import type { Request } from 'express';

import { formatErrorStackSafe } from '@prairielearn/error';
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
  const error_id = sampleSize([...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'], 12).join('');

  const code = getHTTPStatusCodeFromError(opts.error);
  if (code >= 500) {
    Sentry.captureException(opts.error, { tags: { error_id } });
  }

  logger.log(code >= 500 ? 'error' : 'verbose', 'tRPC error', {
    msg: opts.error.message,
    id: error_id,
    status: code,
    code: opts.error.code,
    stack: formatErrorStackSafe(opts.error),
    url: opts.req.originalUrl,
    referrer: opts.req.get('Referrer') ?? null,
    response_id: opts.req.res?.locals.response_id ?? null,
  });
}
