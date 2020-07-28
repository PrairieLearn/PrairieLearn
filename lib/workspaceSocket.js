const ERR = require('async-stacktrace');

const socketServer = require('./socket-server');
const logger = require('./logger');
const workspace = require('./workspace');

const sqldb = require('@prairielearn/prairielib/sql-db');

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
        workspace.controlContainer(workspace_id, 'init', (err) => {
            if (ERR(err, e => logger.error(e))) return;
            
            const state = 'running';
            const params = [
                workspace_id,
                state,
            ];
            // TODO: add locking
            console.log(`[workspaceSocket.js] setting workspaces.state to '${state}'`);
            sqldb.call('workspaces_state_update', params, function(err, _result) {
                if (ERR(err, e => logger.error(e))) return;
                console.log(`[workspaceSocket.js] set workspaces.state to '${state}'`);
                module.exports._namespace.to(workspace_id).emit('change:state', {workspace_id, state});
            });
        });
    });

    socket.on('heartbeat', function () {
        console.log(`Ping from workspace ${workspace_id} received.`);
        //workspace.controlContainer(module.exports._namespace.to(workspace_id), workspace_id, 'sync');
        // sqldb.queryOneRow(sql.select_workspace_state, {workspace_id}, function(err, result) {
        //     if (ERR(err, (err) => logger.error('Error polling workspace state', err))) return;
        //     module.exports._namespace.to(workspace_id).emit('state', `${result.rows[0].workspace_state}`);
        // });
    });

    socket.on('init', function () {
        console.log('Initializing container.');
        workspace.controlContainer(workspace_id, 'init', (err) => {
            if (ERR(err, e => logger.error(e))) return;
            // module.exports._namespace.to(workspace_id).emit('host-ready');
        });
    });

    socket.on('destroy', function () {
        console.log('Destroying container.');
        workspace.controlContainer(workspace_id, 'destroy', (err) => {
            if (ERR(err, e => logger.error(e))) return;
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected.');
    });
};
