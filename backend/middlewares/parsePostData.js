var ERR = require('async-stacktrace');

module.exports = function(req, res, next) {
    if (req.body.postData) {
        try {
            req.postData = JSON.parse(req.body.postData);
        } catch (e) {
            var err = new Error('JSON parse failed on body.postData');
            err.status = 400;
            return next(err);
        }
    }
    next();
};
