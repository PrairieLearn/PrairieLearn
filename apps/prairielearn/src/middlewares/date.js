const { config } = require('../lib/config');

module.exports = function (req, res, next) {
  res.locals.req_date = new Date();
  res.locals.true_req_date = res.locals.req_date;

  // We allow unit tests to override the req_date. Unit tests may also override the user
  // (middlewares/authn.js) and the req_mode (middlewares/authzCourseOrInstance.js).
  if (config.authType === 'none' && req.cookies.pl_test_date) {
    res.locals.req_date = new Date(Date.parse(req.cookies.pl_test_date));
  }

  next();
};
