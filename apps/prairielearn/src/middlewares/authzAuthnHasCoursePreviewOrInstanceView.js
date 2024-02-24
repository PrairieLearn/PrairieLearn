const error = require('@prairielearn/error');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

module.exports = function (req, res, next) {
  debug(res.locals.navbarType);
  if (
    !res.locals.authz_data.authn_has_course_permission_preview &&
    !res.locals.authz_data.authn_has_course_instance_permission_view
  ) {
    return next(
      error.make(403, 'Requires either course preview access or student data view access'),
    );
  }
  next();
};
