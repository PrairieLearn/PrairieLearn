import type { ErrorRequestHandler } from 'express';
import status from 'http-status';

import { logger } from '@prairielearn/logger';

export default (function (err, req, res, _next) {
  logger.error('API Error', err);
  const statusCode = err.status || 500;
  res.status(statusCode).send({
    message: status[statusCode],
  });
} satisfies ErrorRequestHandler);
