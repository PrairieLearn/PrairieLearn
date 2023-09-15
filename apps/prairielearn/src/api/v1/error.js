const { logger } = require('@prairielearn/logger');
const status = require('http-status');

module.exports = (err, req, res, _next) => {
  logger.error('API Error', err);
  const statusCode = err.status || 500;
  res.status(statusCode).send({
    message: status[statusCode],
  });
};
