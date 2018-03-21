var error = require('@prairielearn/prairielib/error');

module.exports = function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_view) {
        return next(error.make(403, 'Requires instructor authorization', {locals: res.locals}));
    }
    next();
};
