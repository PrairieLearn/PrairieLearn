var ERR = require('async-stacktrace');

module.exports = function(req, res, next) {
    res.locals.postAction = req.body.postAction;
    if (req.body.postData) {
        try {
            res.locals.postData = JSON.parse(req.body.postData);
            req.postData = res.locals.postData; // FIME: delete this line and change users of req.postData to use res.locals.post*
        } catch (e) {
            var err = new Error('JSON parse failed on body.postData');
            err.status = 400;
            return next(err);
        }
    }
    next();
};
