import type { ErrorRequestHandler } from 'express';
import jsonStringifySafe from 'json-stringify-safe';

import { AugmentedError, formatErrorStackSafe } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';

import { config } from '../../lib/config.js';

import { ErrorPage } from './error.html.js';

/**
 * Maps HTTP status codes to tRPC error codes (JSON-RPC 2.0 format).
 * These codes match tRPC's internal error code definitions.
 * @see https://github.com/trpc/trpc/blob/main/packages/server/src/unstable-core-do-not-import/rpc/codes.ts
 */
const HTTP_TO_TRPC_CODE: Partial<Record<number, { code: number; name: string }>> = {
  400: { code: -32600, name: 'BAD_REQUEST' },
  401: { code: -32001, name: 'UNAUTHORIZED' },
  403: { code: -32003, name: 'FORBIDDEN' },
  404: { code: -32004, name: 'NOT_FOUND' },
  405: { code: -32005, name: 'METHOD_NOT_SUPPORTED' },
  408: { code: -32008, name: 'TIMEOUT' },
  409: { code: -32009, name: 'CONFLICT' },
  412: { code: -32012, name: 'PRECONDITION_FAILED' },
  413: { code: -32013, name: 'PAYLOAD_TOO_LARGE' },
  422: { code: -32022, name: 'UNPROCESSABLE_CONTENT' },
  429: { code: -32029, name: 'TOO_MANY_REQUESTS' },
  499: { code: -32099, name: 'CLIENT_CLOSED_REQUEST' },
  500: { code: -32603, name: 'INTERNAL_SERVER_ERROR' },
  501: { code: -32603, name: 'NOT_IMPLEMENTED' },
  502: { code: -32603, name: 'BAD_GATEWAY' },
  503: { code: -32603, name: 'SERVICE_UNAVAILABLE' },
  504: { code: -32603, name: 'GATEWAY_TIMEOUT' },
};

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
    url: req.url,
    referrer,
    response_id: res.locals.response_id,
  });

  // Handle errors for tRPC requests (e.g., CSRF failures before tRPC middleware runs).
  // Format the response to match tRPC's expected JSON-RPC 2.0 error structure.
  if (req.header('X-TRPC') === 'true') {
    const trpcError = HTTP_TO_TRPC_CODE[err.status] ?? HTTP_TO_TRPC_CODE[500]!;

    res.json({
      error: {
        // The nested `json` property here is needed because we use `superjson` to
        // serialize and deserialize responses, and it expects the data to be under
        // a `json` property.
        json: {
          message: err.message,
          code: trpcError.code,
          data: {
            code: trpcError.name,
            httpStatus: err.status,
            // Only include stack trace in development mode
            ...(config.devMode && { stack: err.stack }),
          },
        },
      },
    });
    return;
  }

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
