// @ts-check

import jsonStringifySafe from 'json-stringify-safe';

import { formatErrorStackSafe } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';

import { config } from '../../lib/config.js';

import { ErrorPage } from './error.html.js';

/**
 * IMPORTANT: This must take four arguments for it to be identified as
 * error-handling middleware.
 *
 * @see http://expressjs.com/en/guide/using-middleware.html#middleware.error-handling
 *
 * @type {import('express').ErrorRequestHandler}
 */
export default function (err, req, res, _next) {
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
      errorId,
      referrer,
      resLocals: res.locals,
    }),
  );
}
