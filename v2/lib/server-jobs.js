var _ = require('lodash');
var socketIo = require('socket.io');

var logger = require('./logger');

module.exports = {};

module.exports.connection = function(socket) {
    console.log('got connection', 'socket', socket);
    console.log('socket.request', socket.request);

    socket.on('joinJob', function(from, msg, callback) {
        if (!_.has(msg, 'job_id')) return callback({'result': 'error', 'error': 'missing job_id'});
        // FIXME: check authn/authz
        socket.join('job-' + msg.job_id);
        callback({'result': 'success', 'jobOutput': null});
    });
    
    socket.on('disconnect', function(){
        console.log('got disconnect');
    });
};

module.exports.init = function(server, callback) {
    this.io = new socketIo(server);

    this.io.on('connection', this.connection);

    callback(null);
};
