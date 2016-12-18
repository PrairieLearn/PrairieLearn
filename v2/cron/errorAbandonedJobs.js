var ERR = require('async-stacktrace');
var _ = require('lodash');

var serverJobs = require('../lib/server-jobs');

module.exports = {};

module.exports.run = function(callback) {
    serverJobs.errorAbandonedJobs(function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
};
