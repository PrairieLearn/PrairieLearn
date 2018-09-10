const logger = require('../../lib/logger');

module.exports = (err, req, res, _next) => {
    logger.info('API Error', err);
    res.status(500).send(err);
};