const util = require('util');

const serverJobs = require('../lib/server-jobs');

module.exports.run = function (callback) {
  util.callbackify(serverJobs.errorAbandonedJobs)(callback);
};
