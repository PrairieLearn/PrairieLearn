const { logger } = require('@prairielearn/logger');

module.exports = function (req, res, next) {
  if (req.method !== 'OPTIONS') {
    var access = {
      timestamp: new Date().toISOString(),
      ip: req.ip,
      forwardedIP: req.headers['x-forwarded-for'],
      authn_user_id: res.locals.authn_user ? res.locals.authn_user.user_id : null,
      authn_user_uid: res.locals.authn_user ? res.locals.authn_user.uid : null,
      method: req.method,
      path: req.path,
      params: req.params,
      body: req.body,
      response_id: res.locals.response_id,
    };
    logger.verbose('request', access);
  }
  next();
};
