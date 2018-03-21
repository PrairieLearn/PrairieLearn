var error = require('@prairielearn/prairielib/error');

module.exports = function(req, res, next) {
    if (!res.locals.is_administrator) {
        return next(error.make(403, 'Requires administrator privileges', {locals: res.locals}));
    }
    next();
};
