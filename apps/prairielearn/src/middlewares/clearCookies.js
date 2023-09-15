const _ = require('lodash');

const cookies_to_ignore = [
  'pl_authn',
  'pl_assessmentpw',
  'pl_access_as_administrator',
  'pl_disable_auto_authn',
];

module.exports = function (req, res, next) {
  _(req.cookies).each(function (value, key) {
    if (/^pl_/.test(key)) {
      if (cookies_to_ignore.includes(key)) {
        return;
      }
      res.clearCookie(key);
    }
  });
  next();
};
