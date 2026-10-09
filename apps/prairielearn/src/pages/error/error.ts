import type { ErrorRequestHandler } from 'express';

import { AugmentedError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';
import { formatTrpcErrorResponse, isTrpcRequest } from '@prairielearn/trpc/express';

import { config } from '../../lib/config.js';

import { ErrorPage } from './error.html.js';

/**
 * IMPORTANT: This must take four arguments for it to be identified as
 * error-handling middleware.
 *
 * @see http://expressjs.com/en/guide/using-middleware.html#middleware.error-handling
 */
export default (function (err, req, res, _next) {
  const errorId = res.locals.error_id;

  err.status ??= 500;
  res.status(err.status);

  const referrer = req.get('Referrer') || null;

  logger[err.status >= 500 ? 'error' : 'verbose']('Error page', {
    err,
    id: errorId,
    url: req.originalUrl,
    referrer,
    response_id: res.locals.response_id,
  });

  // Handle errors for tRPC requests (e.g., CSRF failures before tRPC middleware runs).
  // Format the response to match tRPC's expected JSON-RPC 2.0 error structure.
  if (isTrpcRequest(req)) {
    res.json(
      formatTrpcErrorResponse({
        status: err.status,
        message: err.message,
        stack: config.devMode ? err.stack : undefined,
      }),
    );
    return;
  }

  if (req.accepts('application/json') && !req.accepts('html')) {
    res.send({
      error: err.message,
      errorId,
    });
    return;
  }

  res.send(
    ErrorPage({
      // Hide error details in production.
      error: config.devMode ? err : { message: err.message, status: err.status },
      // Only include the info property if it's from an AugmentedError.
      // We'll render this as unescaped HTML, so we need to be sure that
      // it's safe to do so, and only AugmentedError guarantees that by
      // forcing the `info` property to be constructed with an `html`
      // template.
      errorInfo: err instanceof AugmentedError ? err.info : undefined,
      errorId,
      referrer,
      resLocals: res.locals,
    }),
  );
} satisfies ErrorRequestHandler);
