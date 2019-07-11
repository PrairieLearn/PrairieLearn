var error = require('@prairielearn/prairielib/error');

module.exports = function(req, res, next) {
    if (!res.locals.authz_data.has_course_permission_view) {
        return next(error.make(403, 'Requires course access permission', {locals: res.locals}));
    }
    next();
};
