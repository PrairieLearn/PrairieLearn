const ERR = require('async-stacktrace');
const request = require('request');
const async = require('async');

const config = require('./config');
const logger = require('./logger');
const socketServer = require('./socket-server');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');		
const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    init() {
        module.exports._namespace = socketServer.io.of('/workspace');
        module.exports._namespace.on('connection', module.exports.connection);
    },

    async updateState(workspace_id, state) {
        // TODO: add locking
        const result = sqldb.callAsync('workspaces_state_update', [workspace_id, state]);
        logger.info(`[workspace.js] set workspaces.state to '${state}'`);
        module.exports._namespace.to(workspace_id).emit('change:state', {workspace_id, state});
    },

    async controlContainer(workspace_id, action) {
        const result = sqldb.queryOneRowAsync(sql.select_workspace, {workspace_id});

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
