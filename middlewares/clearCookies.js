var _ = require('lodash');

module.exports = function(req, res, next) {
    _(req.cookies).each(function(value, key) {
        if (/^pl_/.test(key) && key != 'pl_authn') {
            res.clearCookie(key);
        }
    });
    next();
};
