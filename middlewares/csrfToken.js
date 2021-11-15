const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

var config = require('../lib/config');
var error = require('../prairielib/lib/error');
var csrf = require('../lib/csrf');

module.exports = function (req, res, next) {
  var tokenData = {
    url: req.originalUrl,
  };
  if (res.locals.authn_user && res.locals.authn_user.user_id) {
    tokenData.authn_user_id = res.locals.authn_user.user_id;
  }
  res.locals.__csrf_token = csrf.generateToken(tokenData, config.secretKey);

  if (req.method === 'POST') {
    // NOTE: If you are trying to debug a "CSRF Fail" in a form with file
    // upload, you may have forgotten to special-case the file upload path.
    // Search for "upload.single('file')" in server.js, for example.

    var __csrf_token = req.headers['x-csrf-token']
      ? req.headers['x-csrf-token']
      : req.body.__csrf_token;
    debug(`POST: __csrf_token = ${__csrf_token}`);
    if (!csrf.checkToken(__csrf_token, tokenData, config.secretKey)) {
      return next(
        error.make(403, 'CSRF fail', {
          locals: res.locals,
          tokenData,
          __csrf_token,
        })
      );
    }
  }
  next();
};
