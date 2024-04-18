const error = require('@prairielearn/error');

module.exports = function (req, res, next) {
  if (!res.locals.authz_data.has_course_permission_preview) {
    return next(new error.HttpStatusError(403, 'Requires course preview access'));
  }
  next();
};
