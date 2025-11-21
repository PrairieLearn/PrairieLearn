import type { ErrorRequestHandler } from 'express';
import jsonStringifySafe from 'json-stringify-safe';

import { AugmentedError, formatErrorStackSafe } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';

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

  // TODO: finish this up.
  if (req.header('X-TRPC') === 'true') {
    res.json({
      error: {
        message: err.message,
        // TODO: pick actual correct value
        code: -32003,
        data: {
          // TODO: pick actual correct value
          code: 'FORBIDDEN',
          httpStatus: err.status,
          // TODO: should this be sent in production?
          stack: err.stack,
        },
      },
    });
    return;
  }

  const referrer = req.get('Referrer') || null;

  logger.log(err.status >= 500 ? 'error' : 'verbose', 'Error page', {
    msg: err.message,
    id: errorId,
    status: err.status,
    // Use the "safe" version when logging so that we don't error out while
    // trying to log the actual error.
    stack: formatErrorStackSafe(err),
    data: jsonStringifySafe(err.data),
    url: req.url,
    referrer,
    response_id: res.locals.response_id,
  });

  // Check if the client only accepts JSON
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
