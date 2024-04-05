// @ts-check
import { logger } from '@prairielearn/logger';
const status = require('http-status');

export default function (err, req, res, _next) {
  logger.error('API Error', err);
  const statusCode = err.status || 500;
  res.status(statusCode).send({
    message: status[statusCode],
  });
}
