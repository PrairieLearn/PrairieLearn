const fetch = require('node-fetch');
const AWS = require('aws-sdk');
const awsHelper = require('./aws');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const util = require('util');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const async = require('async');
const archiver = require('archiver');

const config = require('./config');
const logger = require('./logger');
const socketServer = require('./socket-server');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const ERR = require('async-stacktrace');
const sql = sqlLoader.loadSqlEquiv(__filename);

const zipPrefix = config.workspaceMainZipsDirectory;

const zipDirectory = async function (source, zip) {
    const stream = fs.createWriteStream(zip);
    const archive = archiver('zip');

    await new Promise((resolve, reject) => {
        stream.on('open', () => {
            archive.pipe(stream);
            archive.directory(source, false);
            archive.on('error', err => { throw err; });
            archive.finalize();
        }).on('error', (err) => {
            reject(err);
        }).on('finish', () => {
            logger.info(`Zipped ${source} as ${zip} (${archive.pointer()} total bytes)`);
            resolve(zip);
        });
    });
};

async function uploadDirectoryToS3Async(s3Path, bucketName) {
    const s3 = new AWS.S3();

    async function walkDirectory(directory) {
        const files = await fsPromises.readdir(directory);
        await async.each(files, async (file) => {
            const filePath = path.join(directory, file);
            const stat = await fsPromises.stat(filePath);
            if (stat.isFile()) {
                const fileBody = await fsPromises.readFile(filePath);
                const bucketPath = filePath.substring(s3Path.length + 1);
                const params = {
                    Bucket: bucketName,
                    Key: bucketPath,
                    Body: fileBody,
                };
                try {
                    await s3.putObject(params).promise();
                    logger.info(`Synced ${bucketPath} to ${bucketName}`);
                } catch (err) {
                    logger.error(`Error syncing ${bucketPath}:\n ${err}`);
                }
            } else {
                return await walkDirectory(filePath);
            }
        });
    }

    await walkDirectory(s3Path);
}

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
                    if (ERR(err, callback)) return;
                    const workspace = result.rows[0];
                    callback({
                        workspace_id,
                        state: workspace.state,
                    });

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

        socket.on('heartbeat', (msg, callback) => {
            const workspace_id = msg.workspace_id;
            sqldb.queryOneRow(sql.update_workspace_heartbeat_at_now, {workspace_id}, (err, result) => {
                if (ERR(err, callback)) return;
                const heartbeat_at = result.rows[0].heartbeat_at;
                callback({
                    workspace_id,
                    heartbeat_at,
                });
            });
        });
    },

    async updateState(workspace_id, state) {
        // TODO: add locking
        await sqldb.callAsync('workspaces_state_update', [workspace_id, state]);
        logger.info(`Set workspaces.state to '${state}'`);
        module.exports._namespace.to(workspace_id).emit('change:state', {workspace_id, state});
    },

    async controlContainer(workspace_id, action, options={}) {
        const result = await sqldb.queryZeroOrOneRowAsync(sql.select_workspace_host, {workspace_id});
        if (result.rowCount == 0) {
            throw new Error(`No host for workspace_id=${workspace_id}`);
        }
        const workspace_host = result.rows[0];
        const postJson = {
            workspace_id,
            action,
            ...options,
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
            await module.exports.controlContainer(workspace_id, 'init', {useInitialZip: true});
        }
    },

    async initialize(workspace_id) {
        // FIXME: Check we are in "uninitialized"
        let result = await sqldb.queryOneRowAsync(sql.select_workspace_paths, {workspace_id});
        const {course_path, qid} = result.rows[0];
        const localPath = `${course_path}/questions/${qid}/workspace`;
        const s3Path = `${config.workspaceS3Bucket}/workspace-${workspace_id}`;
        const now = new Date().toISOString().replace(/[-T:.]/g, '-');
        const zipName = `workspace-${workspace_id}-${now}.zip`;
        const zipPath = path.join(zipPrefix, zipName);

        logger.info(`Zipping ${localPath} as ${zipPath}`);
        await zipDirectory(localPath, zipPath);
        const isDirectory = false;
        const s3ZipPath = `workspace-${workspace_id}/initial.zip`;
        await awsHelper.uploadToS3Async(zipPath, isDirectory, s3ZipPath, zipPath);

        logger.info(`Syncing ${localPath} to ${s3Path}`);
        await uploadDirectoryToS3Async(localPath, `${s3Path}/current`);
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
