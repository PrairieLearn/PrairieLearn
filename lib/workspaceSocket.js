const socketServer = require('./socket-server');

module.exports = {};

module.exports.init = function (callback) {
  module.exports._namespace = socketServer.io.of('/workspace');
  module.exports._namespace.on('connection', module.exports.connection);

  callback(null);
};

module.exports.connection = function (socket) {
    var workspace_id = socket.handshake.query['id'];

    socket.join(workspace_id, () => {
        let rooms = Object.keys(socket.rooms);
        console.log(rooms);
        console.log('Connection to workspace ' + workspace_id + ' established.');
        module.exports._namespace.to(workspace_id).emit('update', workspace_id);
    });

    socket.on('heartbeat', function () {
        console.log('Ping from workspace ' + workspace_id + ' received.');
        module.exports._namespace.to(workspace_id).emit('update', 'I got your msg!');
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
};
