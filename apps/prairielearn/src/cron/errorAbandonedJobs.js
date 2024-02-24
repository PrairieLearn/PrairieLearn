const util = require('util');

const serverJobs = require('../lib/server-jobs-legacy');

module.exports.run = function (callback) {
  util.callbackify(serverJobs.errorAbandonedJobs)(callback);
};
