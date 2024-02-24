const error = require('@prairielearn/error');

module.exports = function (req, res, next) {
  if (!res.locals.authz_data.has_course_permission_preview) {
    return next(error.make(403, 'Requires course preview access'));
  }
  next();
};
