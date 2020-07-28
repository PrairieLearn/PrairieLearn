const ERR = require('async-stacktrace');
const async = require('async');
const request = require('request');

const config = require('./config.js');
const logger = require('./logger');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {
    controlContainer(workspace_id, action, callback) {
        async.waterfall([
            (callback) => {
                sqldb.query(sql.select_workspace_hosts, {}, function(err, result) {
                    if (err) {
                        logger.error('Error querying workspace hosts', err);
                        return;
                    }
                    logger.info(`controlContainer workspace_hosts query: ${JSON.stringify(result.rows)}`);
                    const workspace_hosts = result.rows;
                    callback(null, workspace_hosts);
                });
            },
            (workspace_hosts, callback) => {
                const index = Math.floor(Math.random() * workspace_hosts.length);
                const workspace_host = workspace_hosts[index];
                logger.info(`controlContainer workspace_host: ${JSON.stringify(workspace_host)}`);
                const params = {
                    workspace_id,
                    workspace_host_id: workspace_host.id,
                };
                sqldb.query(sql.update_workspaces_workspace_host_id, params, function(err, _result) {
                    if (err) {
                        logger.error('Error updating workspaces.workspace_host_id', err);
                        return;
                    }
                    callback(null, workspace_host);
                });
            },
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
                        if ('json' in body) {
                            if ('data' in body.json) {
                                // need to decode the `data` array to be human readable
                                server_error = new Buffer.from(body.json.data).toString();
                            } else if ('message' in body.json) {
                                server_error = body.json.message;
                            }
                        }
                        callback(new Error(`controlContainer could not connect to workspace host: ${server_error}`));
                    }
                });
            },
        ], function(err) {
            if (err) {
                logger.error('controlContainer error:', err);
            }
            callback(null);
        });
    },
};
