const fetch = require('node-fetch');
const AWS = require('aws-sdk');
const awsHelper = require('./aws');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const util = require('util');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const config = require('./config');
const logger = require('./logger');
const socketServer = require('./socket-server');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const zipPrefix = process.env.HOST_JOBS_DIR ? '/jobs/workspace_receive_zips' : config.workspaceGradedFilesReceiveDirectory;

// https://stackoverflow.com/a/46213474/13138364
const s3Sync = function (s3Path, bucketName) {
    const s3 = new AWS.S3();

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
    async init() {
        module.exports._namespace = socketServer.io.of('/workspace');
        module.exports._namespace.on('connection', module.exports.connection);

        debug(`init: zipPrefix=${zipPrefix}`);
        await fs.promises.mkdir(zipPrefix, { recursive: true, mode: 0o700 });

        if (!config.runningInEc2) {
            const configFile = path.join(process.cwd(), 'aws-config.json');
            try {
                await fsPromises.stat(configFile);
                logger.info('Loading configuration from "aws-config.json"');
                AWS.config.loadFromPath(configFile);
            } catch (err) {
                logger.info('Using local S3RVER configuration');
                AWS.config = awsHelper.getS3RVERConfiguration();
            }
        }
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
        const result = await sqldb.queryZeroOrOneRowAsync(sql.select_workspace_host, {workspace_id});
        if (result.rowCount == 0) {
            throw new Error(`No host for workspace_id=${workspace_id}`);
        }
        const workspace_host = result.rows[0];
        const postJson = {
            workspace_id: workspace_id,
            action: action,
        };
        const res = await fetch(`http://${workspace_host.hostname}/`, {
            method: 'post',
            body: JSON.stringify(postJson),
            headers: {'Content-Type': 'application/json'},
        });
        if (action === 'getGradedFiles') {
            const contentDisposition = res.headers.get('content-disposition');
            if (contentDisposition == null) throw new Error(`Content-Disposition is null`);
            const match = contentDisposition.match(/^attachment; filename="(.*)"$/);
            if (!match) throw new Error(`Content-Disposition format error: ${contentDisposition}`);
            const zipName = match[1];
            const zipPath = path.join(zipPrefix, zipName);

            debug(`controlContainer: saving ${zipPath}`);
            let stream = fs.createWriteStream(zipPath);

            return new Promise((resolve, reject) => {
                stream.on('open', () => {
                    res.body.pipe(stream);
                }).on('error', (err) => {
                    reject(err);
                }).on('finish', () => {
                    resolve(zipPath);
                });
            });
        }
        if (res.ok) return;

        // if there was an error, we should have an error message from the host
        const json = res.json();
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

    async getGradedFiles(workspace_id) {
        let zipPath;

        const result = await sqldb.queryOneRowAsync(sql.select_workspace, {workspace_id});
        const workspace = result.rows[0];

        if (workspace.state == 'uninitialized') {
            // there are no files yet
            return null;
        }

        if (workspace.state == 'running') {
            // get the files directly from the host
            try {
                const action = 'getGradedFiles';
                zipPath = await module.exports.controlContainer(workspace_id, action);
            } catch (err) {
                logger.error(err);
                // something went wrong, so fall back to S3
            }
        }

        if (zipPath == null) {
            zipPath = await module.exports.getGradedFilesFromS3(workspace_id);
        }

        return zipPath;
    },

    async getGradedFilesFromS3(workspace_id) {
        const timestamp = new Date().toISOString().replace(/[-T:.]/g, '-');
        const zipName = `workspace-${workspace_id}-${timestamp}.zip`;
        const zipPath = path.join(zipPrefix, zipName);

        // we should get the gradedFiles from S3 and zip them into zipPath

        throw new Error('getGradedFilesFromS3() is not yet implemented');

        // we have a temporary eslint disable statement here until this is implemented
        return zipPath; // eslint-disable-line no-unreachable
    },
};
