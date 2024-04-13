const error = require('@prairielearn/error');

module.exports = function (req, res, next) {
  if (!res.locals.is_administrator) {
    return next(new error.HttpStatusError(403, 'Requires administrator privileges'));
  }
  next();
};
