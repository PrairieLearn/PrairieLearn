const _ = require('lodash');

const { config } = require('../lib/config');

const cookies_to_ignore = [
  'pl_authn',
  'pl2_authn',
  'pl_assessmentpw',
  'pl2_assessmentpw',
  'pl_access_as_administrator',
  'pl2_access_as_administrator',
  'pl_disable_auto_authn',
  'pl2_disable_auto_authn',
];

module.exports = function (req, res, next) {
  _(req.cookies).each(function (value, key) {
    if (/^pl_/.test(key)) {
      if (cookies_to_ignore.includes(key)) {
        return;
      }
      res.clearCookie(key);
      res.clearCookie(key, { domain: config.cookieDomain });
    }
  });
  next();
};
