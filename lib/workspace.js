const ERR = require('async-stacktrace');
const request = require('request');
const async = require('async');

const config = require('./config');
const logger = require('./logger');
const socketServer = require('./socket-server');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');		
const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {};

module.exports.init = function (callback) {
  module.exports._namespace = socketServer.io.of('/workspace');
  module.exports._namespace.on('connection', module.exports.connection);
  callback(null);
};

module.exports.updateState = function (workspace_id, state, callback) {
    // TODO: add locking
    sqldb.call('workspaces_state_update', [workspace_id, state], function(err, _result) {
        if (ERR(err)) return;
        logger.info(`[workspace.js] set workspaces.state to '${state}'`);
        module.exports._namespace.to(workspace_id).emit('change:state', {workspace_id, state});
        callback(null);
    });
};

module.exports.controlContainer = function (workspace_id, action, callback) {
    async.waterfall([
        // query available hosts
        (callback) => {
            sqldb.query(sql.select_workspace_hosts, {}, function(err, result) {
                if (ERR(err, callback)) return;
                logger.info(`controlContainer workspace_hosts query: ${JSON.stringify(result.rows)}`);
                const workspace_hosts = result.rows;
                callback(null, workspace_hosts);
            });
        },
        // choose host
        (workspace_hosts, callback) => {
            const index = Math.floor(Math.random() * workspace_hosts.length);
            const workspace_host = workspace_hosts[index];
            logger.info(`controlContainer workspace_host: ${JSON.stringify(workspace_host)}`);
            const params = {
                workspace_id,
                workspace_host_id: workspace_host.id,
            };
            sqldb.query(sql.update_workspaces_workspace_host_id, params, function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null, workspace_host);
            });
        },
        // start container on host
        (workspace_host, callback) => {
            const hostname = workspace_host.hostname;
            const port = config.workspaceContainerPort;
            const options = {
                json: {
                    workspace_id: workspace_id,
                    action: action,
                },
            };
            request.post(`http://${hostname}:${port}/`, options, (err, res, body) => {
                if (ERR(err, callback)) return;
                logger.info(`controlContainer ${action} statusCode: ${res.statusCode}`);
                logger.info(`controlContainer body: ${body}`);
                if (res.statusCode == 200) {
                    if (action == 'init') {
                        logger.info('controlContainer: container started');
                    }
                    callback(null);
                } else {
                    let server_error = 'unknown error';
                    if (body) {
                        if ('json' in body) {
                            if ('data' in body.json) {
                                // need to decode the `data` array to be human readable
                                server_error = new Buffer.from(body.json.data).toString();
                            } else if ('message' in body.json) {
                                server_error = body.json.message;
                            }
                        }
                    }
                    callback(new Error(`controlContainer could not connect to workspace host: ${server_error}`));
                }
            });
        },
    ], function(err) {
        if (ERR(err, callback)) return;
        callback(null);
    });
};

module.exports.connection = function (socket) {
    const workspace_id = socket.handshake.query['workspace_id'];

    socket.join(workspace_id, () => {
        let rooms = Object.keys(socket.rooms);
        console.log(rooms);
        console.log(`Connection to workspace ${workspace_id} established.`);
        console.log('Initializing remote workspace host.');
        module.exports.controlContainer(workspace_id, 'init', (err) => {
            if (ERR(err, e => logger.error(e))) return;
            
            const state = 'running';
            module.exports.updateState(workspace_id, state, () => {
                if (ERR(err, e => logger.error(e))) return;
            });
        });
    });

    socket.on('heartbeat', function () {
        console.log(`Ping from workspace ${workspace_id} received.`);
    });

    socket.on('init', function () {
        console.log('Initializing container.');
        module.exports.controlContainer(workspace_id, 'init', (err) => {
            if (ERR(err, e => logger.error(e))) return;
            // module.exports._namespace.to(workspace_id).emit('host-ready');
        });
    });

    socket.on('destroy', function () {
        console.log('Destroying container.');
        module.exports.controlContainer(workspace_id, 'destroy', (err) => {
            if (ERR(err, e => logger.error(e))) return;
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected.');
    });
};
