var _ = require('lodash');
var path = require('path');
var jsonStringifySafe = require('json-stringify-safe');

var logger = require('../../lib/logger');

module.exports = function(err, req, res, _next) {
    // clear all cookies in case something was misconfigured, except in the case of 404s
    if (err.status != 404) {
        _(req.cookies).each(function(value, key) {
            res.clearCookie(key);
        });
    }

    var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    var errorId = _.times(12, function() {return _.sample(chars);}).join('');

    res.status(err.status || 500);
    var referrer = req.get('Referrer') || null;
    logger.info('Error page', {
        msg: err.message,
        id: errorId,
        status: err.status,
        stack: err.stack,
        data: jsonStringifySafe(err.data),
        referrer: referrer,
        response_id: res.locals.response_id,
    });

    const templateData = {
        error: err,
        error_data: jsonStringifySafe(_.omit(_.get(err, ['data'], {}), ['sql', 'sqlParams', 'sqlError']), null, '    '),
        error_data_sqlError: jsonStringifySafe(_.get(err, ['data', 'sqlError'], null), null, '    '),
        error_data_sqlParams: jsonStringifySafe(_.get(err, ['data', 'sqlParams'], null), null, '    '),
        id: errorId,
        referrer: referrer,
    };
    if (req.app.get('env') == 'development') {
        // development error handler
        // will print stacktrace
        res.render(path.join(__dirname, 'error'), templateData);
    } else {
        // production error handler
        // no stacktraces leaked to user
        templateData.error = {message: err.message};
        res.render(path.join(__dirname, 'error'), templateData);
    }
};
