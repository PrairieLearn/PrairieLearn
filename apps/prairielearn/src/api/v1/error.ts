import type { ErrorRequestHandler } from 'express';
import status from 'http-status';

import { HttpStatusError } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';

export default (function (err, req, res, _next) {
  const statusCode = err.status || 500;
  logger[statusCode >= 500 ? 'error' : 'verbose']('API Error', {
    err,
    status: statusCode,
    url: req.originalUrl,
    response_id: res.locals.response_id,
  });
  // Messages of client errors we raise explain how to fix the request; other errors may expose
  // internals, so they get only the status text.
  const message =
    err instanceof HttpStatusError && statusCode < 500
      ? err.message
      : // oxlint-disable-next-line typescript/no-unnecessary-condition
        (status[statusCode as keyof typeof status] ?? 'Unknown status code');
  res.status(statusCode).send({ message, status: statusCode });
}) satisfies ErrorRequestHandler;
