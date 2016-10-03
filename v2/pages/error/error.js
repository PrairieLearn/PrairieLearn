var path = require('path');

var logger = require('../../lib/logger');

module.exports = function(err, req, res, next) {
    // clear all cookies in case something was misconfigured
    _(req.cookies).each(function(value, key) {
        res.clearCookie(key);
    });

    if (false) {
    //if (req.app.get('env') === 'development') {
        // development error handler
        // will print stacktrace
        res.status(err.status || 500);
        logger.error('Error page', {msg: err.message, data: err.data, stack: err.stack});
        res.render(path.join(__dirname, 'error'), {
            message: err.message,
            error: err,
            data: err.data,
        });
    } else {
        // production error handler
        // no stacktraces leaked to user
        res.status(err.status || 500);
        logger.error('Error page', {msg: err.message, data: err.data, stack: err.stack});
        res.render(path.join(__dirname, 'error'), {
            message: err.message,
            error: {}
        });
    }
};
