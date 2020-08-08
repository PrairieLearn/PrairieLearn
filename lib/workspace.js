const fetch = require('node-fetch');
const AWS = require('aws-sdk');
const path = require('path');
const fs = require('fs');
const util = require('util');

const config = require('./config');
const logger = require('./logger');
const socketServer = require('./socket-server');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);




// https://stackoverflow.com/a/46213474/13138364
const s3Sync = function (s3Path, bucketName) {
    const awsConfig = {
        s3ForcePathStyle: true,
        accessKeyId: 'S3RVER',
        secretAccessKey: 'S3RVER',
        endpoint: new AWS.Endpoint('http://localhost:5000'),
    };

    const s3 = new AWS.S3(awsConfig);

    function walkSync(currentDirPath, callback) {
        fs.readdirSync(currentDirPath).forEach(function (name) {
            const filePath = path.join(currentDirPath, name);
            const stat = fs.statSync(filePath);
            if (stat.isFile()) {
                callback(filePath, stat);
            } else if (stat.isDirectory()) {
                walkSync(filePath, callback);
            }
        });
    }

    walkSync(s3Path, function (filePath, _stat) {
        const bucketPath = filePath.substring(s3Path.length + 1);
        const params = {
            Bucket: bucketName,
            Key: bucketPath,
            Body: fs.readFileSync(filePath),
        };
        s3.putObject(params, function (err, _data) {
            if (err) {
                console.log(err);
            } else {
                console.log(`[workspace.js] synced ${bucketPath} to ${bucketName}`);
            }
        });
    });
};




module.exports = {
    init() {
        module.exports._namespace = socketServer.io.of('/workspace');
        module.exports._namespace.on('connection', module.exports.connection);
    },

    connection(socket) {
        socket.on('joinWorkspace', (msg, callback) => {
            const workspace_id = msg.workspace_id;
            socket.join(workspace_id, () => {
                // FIXME: lock the workspace row
                sqldb.queryOneRow(sql.select_workspace, {workspace_id}, (err, result) => {
                    if (err) {
                        logger.error(`Error selecting workspace_id=${workspace_id}: ${err}`);
                        return;
                    }
                    const workspace = result.rows[0];
                    callback({state: workspace.state});

                    // keep going past callback
                    util.callbackify(module.exports.startup)(workspace_id, workspace.state, (err) => {
                        if (err) {
                            logger.error(`Error from startup(): ${err}`);
                            // FIXME: transition to state 'error'
                        }
                    });
                });
            });
        });
    },

    async updateState(workspace_id, state) {
        // TODO: add locking
        await sqldb.callAsync('workspaces_state_update', [workspace_id, state]);
        logger.info(`[workspace.js] set workspaces.state to '${state}'`);
        module.exports._namespace.to(workspace_id).emit('change:state', {workspace_id, state});
    },

    async controlContainer(workspace_id, action) {
        logger.info(`... entering controlContainer`);
        const result = await sqldb.queryZeroOrOneRowAsync(sql.select_workspace_host, {workspace_id});
        if (result.rowCount == 0) {
            throw new Error(`No host for workspace_id=${workspace_id}`);
        }
        const workspace_host = result.rows[0];
        const postJson = {
            workspace_id: workspace_id,
            action: action,
        };
        logger.info(`... downloading graded files`);
        const res = await fetch(`http://${workspace_host.hostname}/`, {
            method: 'post',
            body: JSON.stringify(postJson),
            headers: {'Content-Type': 'application/json'},
        });
        if (action === 'getGradedFiles') {
            logger.info(`... action === 'getGradedFiles'`)
            const zipPrefix = config.workspaceGradedFilesMainDirectory;
            logger.info(`... mkdir ${zipPrefix}`);
            await fs.promises.mkdir(zipPrefix, { recursive: true, mode: 0o700 });
            logger.info(`... made dir ${zipPrefix}`);
            const path = `${zipPrefix}/workspace-${workspace_id}-graded-files.zip`;
            let stream = fs.createWriteStream(path);
            logger.info(`... saving ${path}`);

            return new Promise((resolve, reject) => {
                stream.on('open', () => {
                    res.body.pipe(stream);
                }).on('error', (err) => {
                    reject(err);
                }).on('finish', () => {
                    logger.info(`... saved ${path}`);
                    resolve(path);
                });
            });
        } else {
            logger.info(`... action !== 'getGradedFiles'`)
        }
        if (res.ok) return;

        // if there was an error, we should have an error message from the host
        const json = await res.json();
        throw new Error(`Error from workspace host: ${json.message}`);
    },

    async startup(workspace_id, state) {
        if (state == 'uninitialized' || state == 'stopped') {
            if (state == 'uninitialized') {
                await module.exports.initialize(workspace_id);
                await module.exports.updateState(workspace_id, 'stopped');
            }
            await module.exports.updateState(workspace_id, 'launching');
            await module.exports.assignHost(workspace_id);
            await module.exports.controlContainer(workspace_id, 'init');
        }
    },

    async initialize(workspace_id) {
        // FIXME: Check we are in "uninitialized"
        let result = await sqldb.queryOneRowAsync(sql.select_workspace_paths, {workspace_id});
        const {course_path, qid} = result.rows[0];
        const localPath = `${course_path}/questions/${qid}/workspace`;
        const s3Path = `${config.workspaceS3Bucket}/workspace-${workspace_id}`;
        console.log(`[workspace.js] syncing ${localPath} to ${s3Path}`);
        s3Sync(localPath, s3Path); // FIXME: replace with async version
    },

    async assignHost(workspace_id) {
        // query available hosts
        const result = await sqldb.queryAsync(sql.select_workspace_hosts, {});
        logger.info(`controlContainer workspace_hosts query: ${JSON.stringify(result.rows)}`);
        const workspace_hosts = result.rows;
        if (workspace_hosts.length == 0) {
            throw new Error(`No workspace hosts found for workspace_id=${workspace_id}`);
        }

        // choose host
        const index = Math.floor(Math.random() * workspace_hosts.length);
        const workspace_host = workspace_hosts[index];
        logger.info(`controlContainer workspace_host: ${JSON.stringify(workspace_host)}`);
        const params = {
            workspace_id,
            workspace_host_id: workspace_host.id,
        };
        await sqldb.queryAsync(sql.update_workspaces_workspace_host_id, params);
    },
};
