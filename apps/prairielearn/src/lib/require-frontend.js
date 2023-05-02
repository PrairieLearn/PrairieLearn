/**
 * Require frontend modules.
 *
 * Note: Do not use to require backend modules, as they should be CommonJS
 * modules and not AMD modules.
 */
var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
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

requirejs.undefQuestionServers = function (coursePath, logger, callback) {
  // Only try and undefine modules that are already defined, as listed in:
  //     requireFrontend.s.contexts._.defined
  // This is necessary because of incomplete questions (in particular, those with info.json but no server.js).
  logger.verbose('Unloading cached copies of server.js files in ' + coursePath + ' ...');
  var count = 0;
  async.each(
    _.keys(requirejs.s.contexts._.defined),
    function (modPath, callback) {
      if (_.startsWith(modPath, coursePath)) {
        count++;
        requirejs.undef(modPath);
      }
      callback(null);
    },
    function (err) {
      if (ERR(err, callback)) return;
      logger.verbose('Successfully unloaded ' + count + ' cached files');
      callback(null);
    }
  );
};

module.exports = requirejs;
