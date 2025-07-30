import type * as http from 'node:http';

import { captureException, getIsolationScope, httpRequestToRequestData } from '@sentry/core';
import { ensureIsWrapped } from '@sentry/node-core';

interface MiddlewareError extends Error {
  status?: number | string;
  statusCode?: number | string;
  status_code?: number | string;
  output?: {
    statusCode?: number | string;
  };
}

type ExpressMiddleware = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: () => void,
) => void;

type ExpressErrorMiddleware = (
  error: MiddlewareError,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: (error: MiddlewareError) => void,
) => void;

interface ExpressHandlerOptions {
  /**
   * Callback method deciding whether error should be captured and sent to Sentry
   * @param error Captured middleware error
   */
  shouldHandleError?(error: MiddlewareError): boolean;
}

/**
 * An Express-compatible error handler.
 */
export function expressErrorHandler(options?: ExpressHandlerOptions): ExpressErrorMiddleware {
  return function sentryErrorMiddleware(
    error: MiddlewareError,
    request: http.IncomingMessage,
    res: http.ServerResponse,
    next: (error: MiddlewareError) => void,
  ): void {
    const normalizedRequest = httpRequestToRequestData(request);
    // Ensure we use the express-enhanced request here, instead of the plain HTTP one
    // When an error happens, the `expressRequestHandler` middleware does not run, so we set it here too
    getIsolationScope().setSDKProcessingMetadata({ normalizedRequest });

    const shouldHandleError = options?.shouldHandleError || defaultShouldHandleError;

    if (shouldHandleError(error)) {
      const eventId = captureException(error, {
        mechanism: { type: 'middleware', handled: false },
      });
      (res as { sentry?: string }).sentry = eventId;
    }

    next(error);
  };
}

function expressRequestHandler(): ExpressMiddleware {
  return function sentryRequestMiddleware(
    request: http.IncomingMessage,
    _res: http.ServerResponse,
    next: () => void,
  ): void {
    const normalizedRequest = httpRequestToRequestData(request);
    // Ensure we use the express-enhanced request here, instead of the plain HTTP one
    getIsolationScope().setSDKProcessingMetadata({ normalizedRequest });

    next();
  };
}

/**
 * Add an Express error handler to capture errors to Sentry.
 *
 * The error handler must be before any other middleware and after all controllers.
 *
 * @param app The Express instances
 * @param options {ExpressHandlerOptions} Configuration options for the handler
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 * const express = require("express");
 *
 * const app = express();
 *
 * // Add your routes, etc.
 *
 * // Add this after all routes,
 * // but before any and other error-handling middlewares are defined
 * Sentry.setupExpressErrorHandler(app);
 *
 * app.listen(3000);
 * ```
 */
export function setupExpressErrorHandler(
  app: { use: (middleware: ExpressMiddleware | ExpressErrorMiddleware) => unknown },
  options?: ExpressHandlerOptions,
): void {
  app.use(expressRequestHandler());
  app.use(expressErrorHandler(options));
  ensureIsWrapped(app.use, 'express');
}

function getStatusCodeFromResponse(error: MiddlewareError): number {
  const statusCode =
    error.status || error.statusCode || error.status_code || error.output?.statusCode;
  return statusCode ? parseInt(statusCode as string, 10) : 500;
}

/** Returns true if response code is internal server error */
function defaultShouldHandleError(error: MiddlewareError): boolean {
  const status = getStatusCodeFromResponse(error);
  return status >= 500;
}
