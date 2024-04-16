//@ts-check
/**
 * Require frontend modules.
 *
 * Note: Do not use to require backend modules, as they should be CommonJS
 * modules and not AMD modules.
 */
var requirejs = require('requirejs');
var path = require('node:path');

const { logger } = require('@prairielearn/logger');

const { APP_ROOT_PATH } = require('./paths');

requirejs.config({
  nodeRequire: require,
  baseUrl: path.join(APP_ROOT_PATH, 'public/localscripts/calculationQuestion'),
});

requirejs.onError = function (err) {
  var data = {
    errorMsg: err.toString(),
    stack: err.stack,
  };
  for (var e in err) {
    if (Object.prototype.hasOwnProperty.call(err, e)) {
      data[e] = String(err[e]);
    }
  }
  logger.error('requirejs load error', data);
};

module.exports = requirejs;
