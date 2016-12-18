var ERR = require('async-stacktrace');
var _ = require('lodash');
var socketIo = require('socket.io');

module.exports = {};

module.exports.init = function(server, callback) {
    this.io = new socketIo(server);
    callback(null);
};
