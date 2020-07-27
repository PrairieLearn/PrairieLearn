const ERR = require('async-stacktrace');
const request = require('request');

const socketServer = require('./socket-server');
const config = require('./config.js');
const logger = require('./logger');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.init = function (callback) {
  module.exports._namespace = socketServer.io.of('/workspace');
  module.exports._namespace.on('connection', module.exports.connection);

  callback(null);
};

async function controlContainer(callback, workspace_id, action) {
    let promise = new Promise(resolve => {
        request.post(`http://${config.workspaceContainerLocalhost}:${config.workspaceContainerPort}/`, {
            json: {
                workspace_id: workspace_id,
                action: action,
            },
        }, (error, response, body) => {
            if (error) {
                console.log(error);
                return;
            }
            console.log(`statusCode: ${response.statusCode}`);
            console.log(body);
            if (response.statusCode == 200) {
                resolve(true);
            } else {
                /* Display an error if we have one from the server */
                let server_error = 'unknown error';
                if (body) {
                    server_error = body;
                }
                logger.error(`Could not connect to workspace host: ${server_error}`);
                resolve(false);
            }
        });
    });
    let res = await promise;
    if (res) {
        if (action == 'init') {
            console.log('Container started');
            callback.emit('host-ready', '');
        }
    } else {
        console.log('Failed to execute ' + action);
    }
}

module.exports.connection = function (socket) {
    const workspace_id = socket.handshake.query['workspace_id'];

    socket.join(workspace_id, () => {
        let rooms = Object.keys(socket.rooms);
        console.log(rooms);
        console.log(`Connection to workspace ${workspace_id} established.`);
        console.log('Initializing remote workspace host.');
        controlContainer(module.exports._namespace.to(workspace_id), workspace_id, 'init');
    });

    socket.on('heartbeat', function () {
        console.log(`Ping from workspace ${workspace_id} received.`);
        controlContainer(module.exports._namespace.to(workspace_id), workspace_id, 'sync');
        sqldb.queryOneRow(sql.select_workspace_state, {workspace_id}, function(err, result) {
            if (ERR(err, (err) => logger.error('Error polling workspace state', err))) return;
            module.exports._namespace.to(workspace_id).emit('state', `${result.rows[0].workspace_state}`);
        });
    });

    socket.on('init', function () {
        console.log('Initializing container.');
        controlContainer(module.exports._namespace.to(workspace_id), workspace_id, 'init');
    });

    socket.on('destroy', function () {
        console.log('Destroying container.');
        controlContainer(module.exports._namespace.to(workspace_id), workspace_id, 'destroy');
    });

    socket.on('disconnect', () => {
        console.log('User disconnected.');
        // controlContainer(module.exports._namespace.to(workspace_id), workspace_id, 'sync');
    });
};
