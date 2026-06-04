import type { ErrorRequestHandler } from 'express';
import status from 'http-status';
import jsonStringifySafe from 'json-stringify-safe';

import { formatErrorStackSafe } from '@prairielearn/error';
import { logger } from '@prairielearn/logger';

export default (function (err, req, res, _next) {
  const statusCode = err.status || 500;
  logger.log(statusCode >= 500 ? 'error' : 'verbose', 'API Error', {
    msg: err.message,
    status: statusCode,
    stack: formatErrorStackSafe(err),
    data: jsonStringifySafe(err.data),
    response_id: res.locals.response_id,
  });
  res.status(statusCode).send({
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    message: status[statusCode as keyof typeof status] ?? 'Unknown status code',
    status: statusCode,
  });
} satisfies ErrorRequestHandler);
