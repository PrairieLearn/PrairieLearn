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

  const referrer = req.get('Referrer') || null;

  logger.log(err.status >= 500 ? 'error' : 'verbose', 'Error page', {
    msg: err.message,
    id: errorId,
    status: err.status,
    // Use the "safe" version when logging so that we don't error out while
    // trying to log the actual error.
    stack: formatErrorStackSafe(err),
    data: jsonStringifySafe(err.data),
    referrer,
    response_id: res.locals.response_id,
  });

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
