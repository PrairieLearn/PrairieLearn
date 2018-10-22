const logger = require('../../lib/logger');
const status = require('http-status');

module.exports = (err, req, res, _next) => {
    logger.info('API Error', err);
    const statusCode = err.status || 500;
    res.status(statusCode).send({
        message: status[statusCode],
    });
};
