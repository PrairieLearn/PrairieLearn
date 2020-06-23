const _ = require('lodash');

const cookies_to_ignore = ['pl_authn', 'pl_assessmentpw', 'pl_requested_login_type'];

module.exports = function(req, res, next) {
    _(req.cookies).each(function(value, key) {
        if (/^pl_/.test(key)) {
            if (cookies_to_ignore.includes(key)) {
                return;
            }
            res.clearCookie(key);
        }
    });
    next();
};
