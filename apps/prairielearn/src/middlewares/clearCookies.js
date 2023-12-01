const _ = require('lodash');

const { clearCookie } = require('../lib/cookie');

const cookies_to_ignore = [
  'pl_authn',
  'pl2_authn',
  'pl_assessmentpw',
  'pl2_assessmentpw',
  'pl_access_as_administrator',
  'pl2_access_as_administrator',
  'pl_disable_auto_authn',
  'pl2_disable_auto_authn',
  'pl_session',
  'pl2_session',
];

module.exports = function (req, res, next) {
  _(req.cookies).each(function (value, key) {
    if (/^pl2?_/.test(key)) {
      if (cookies_to_ignore.includes(key)) {
        return;
      }
      clearCookie(res, key);
    }
  });
  next();
};
