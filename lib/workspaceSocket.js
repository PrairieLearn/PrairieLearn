const ERR = require('async-stacktrace');

const socketServer = require('./socket-server');
const logger = require('./logger');
const workspace = require('./workspace');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.init = function (callback) {
  module.exports._namespace = socketServer.io.of('/workspace');
  module.exports._namespace.on('connection', module.exports.connection);

  callback(null);
};

module.exports.connection = function (socket) {
    const workspace_id = socket.handshake.query['workspace_id'];

    socket.join(workspace_id, () => {
        let rooms = Object.keys(socket.rooms);
        console.log(rooms);
        console.log(`Connection to workspace ${workspace_id} established.`);
        console.log('Initializing remote workspace host.');
        workspace.controlContainer(module.exports._namespace.to(workspace_id), workspace_id, 'init');
    });

    socket.on('heartbeat', function () {
        console.log(`Ping from workspace ${workspace_id} received.`);
        workspace.controlContainer(module.exports._namespace.to(workspace_id), workspace_id, 'sync');
        sqldb.queryOneRow(sql.select_workspace_state, {workspace_id}, function(err, result) {
            if (ERR(err, (err) => logger.error('Error polling workspace state', err))) return;
            module.exports._namespace.to(workspace_id).emit('state', `${result.rows[0].workspace_state}`);
        });
    });

    socket.on('init', function () {
        console.log('Initializing container.');
        workspace.controlContainer(module.exports._namespace.to(workspace_id), workspace_id, 'init');
    });

    socket.on('destroy', function () {
        console.log('Destroying container.');
        workspace.controlContainer(module.exports._namespace.to(workspace_id), workspace_id, 'destroy');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected.');
        // workspace.controlContainer(module.exports._namespace.to(workspace_id), workspace_id, 'sync');
    });
};
