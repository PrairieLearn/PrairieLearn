
module.exports = function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    err.data = {
        url: req.url,
        method: req.method,
        authUID: req.authUID,
        userUID: req.userUID,
        mode: req.mode
    };
    next(err);
};
