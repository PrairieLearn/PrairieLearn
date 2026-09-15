import type { ErrorRequestHandler } from 'express';
import status from 'http-status';

import { logger } from '@prairielearn/logger';

export default (function (err, req, res, _next) {
  const statusCode = err.status || 500;
  logger[statusCode >= 500 ? 'error' : 'verbose']('API Error', {
    err,
    status: statusCode,
    url: req.originalUrl,
    response_id: res.locals.response_id,
  });
  res.status(statusCode).send({
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    message: status[statusCode as keyof typeof status] ?? 'Unknown status code',
    status: statusCode,
  });
} satisfies ErrorRequestHandler);
