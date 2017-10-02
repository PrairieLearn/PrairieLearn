var ERR = require('async-stacktrace');

module.exports = {};

module.exports.run = function(callback) {
    console.log('externalGraderLoad');
    callback(null);
};
