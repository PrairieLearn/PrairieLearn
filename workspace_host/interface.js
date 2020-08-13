const ERR = require('async-stacktrace');
const _ = require('lodash');
const util = require('util');
const express = require('express');
const app = express();
const http = require('http');
const request = require('request');
const path = require('path');
const AWS = require('aws-sdk');
const Docker = require('dockerode');
const fs = require('fs');
const async = require('async');
const awsHelper = require('../lib/aws');
const socketServer = require('../lib/socket-server'); // must load socket server before workspace
const workspaceHelper = require('../lib/workspace');
const logger = require('../lib/logger');
const chokidar = require('chokidar');
const fsPromises = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const argv = require('yargs-parser') (process.argv.slice(2));
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const archiver = require('archiver');
const net = require('net');
const unzipper = require('unzipper');
const LocalLock = require('../lib/local-lock');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const aws = require('../lib/aws.js');
const config = require('../lib/config');
let configFilename = 'config.json';
if ('config' in argv) {
    configFilename = argv['config'];
}
config.loadConfig(configFilename);
const zipPrefix = config.workspaceHostZipsDirectory;

logger.info('Workspace S3 bucket: ' + config.workspaceS3Bucket);

const bodyParser = require('body-parser');
const docker = new Docker();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// TODO: refactor into RESTful endpoints (https://github.com/PrairieLearn/PrairieLearn/pull/2841#discussion_r467245108)
app.post('/', function(req, res) {
    const workspace_id = req.body.workspace_id;
    const action = req.body.action;
    const useInitialZip = _.get(req.body.options, 'useInitialZip', false);
    if (workspace_id == undefined) {
        res.status(500).send('Missing workspace_id');
    } else if (action == undefined) {
        res.status(500).send('Missing action');
    } else if (action == 'init') {
        initSequence(workspace_id, useInitialZip, res);
    } else if (action == 'reset') {
        resetSequence(workspace_id, res);
    } else if (action == 'getGradedFiles') {
        gradeSequence(workspace_id, res);
    } else if (action == 'status') {
        res.status(200).send('Running');
    } else {
        res.status(500).send(`Action '${action}' undefined`);
    }
});

let server;
let workspace_server_settings = {
    instance_id: config.workspaceDevHostInstanceId,
    /* The workspace server's hostname */
    hostname: config.workspaceDevHostHostname,
    /* How the main server connects to the container.  In docker, this is the host operating system. */
    server_to_container_hostname: config.workspaceDevContainerHostname,
    port: config.workspaceHostPort,
};

async.series([
    (callback) => {
        const pgConfig = {
            user: config.postgresqlUser,
            database: config.postgresqlDatabase,
            host: config.postgresqlHost,
            password: config.postgresqlPassword,
            max: 100,
            idleTimeoutMillis: 30000,
        };
        logger.verbose(`Connecting to database ${pgConfig.user}@${pgConfig.host}:${pgConfig.database}`);
        const idleErrorHandler = function(err) {
            logger.error('idle client error', err);
            // https://github.com/PrairieLearn/PrairieLearn/issues/2396
            process.exit(1);
        };
        sqldb.init(pgConfig, idleErrorHandler, function(err) {
            if (ERR(err, callback)) return;
            logger.verbose('Successfully connected to database');
            callback(null);
        });
    },
    (callback) => {
        aws.init((err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
    (callback) => {
        socketServer.init(server, function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
    (callback) => {
        util.callbackify(workspaceHelper.init)(err => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
    (callback) => {
        if (config.runningInEc2) {
            const MetadataService = new AWS.MetadataService();
            async.series([
                (callback) => {
                    MetadataService.request('/latest/dynamic/instance-identity/document', (err, document) => {
                        if (ERR(err, callback)) return;
                        try {
                            const data = JSON.parse(document);
                            logger.info('instance-identity', data);
                            AWS.config.update({'region': data.region});
                            workspace_server_settings.instance_id = data.instanceId;
                            callback(null);
                        } catch (err) {
                            return callback(err);
                        }
                    });
                },
                (callback) => {
                    MetadataService.request('/latest/meta-data/local-hostname', (err, hostname) => {
                        if (ERR(err, callback)) return;
                        workspace_server_settings.hostname = hostname;
                        workspace_server_settings.server_to_container_hostname = hostname;
                        callback(null);
                    });
                },
            ], (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        } else {
            /* Not running in ec2 */
            callback(null);
        }
    },
    (callback) => {
        fs.mkdir(zipPrefix, { recursive: true, mode: 0o700 }, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
    (callback) => {
        server = http.createServer(app);
        server.listen(workspace_server_settings.port);
        logger.info(`Listening on port ${workspace_server_settings.port}`);
        callback(null);
    },
    (callback) => {
        // Add ourselves to the workspace hosts directory. After we
        // do this we will start receiving requests so everything else
        // must be initialized before this.
        const params = {
            hostname: workspace_server_settings.hostname + ':' + workspace_server_settings.port,
            instance_id: workspace_server_settings.instance_id,
        };
        sqldb.query(sql.insert_workspace_hosts, params, function(err, _result) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
    async () => {
        /* If we have any running workspaces we're probably recovering from a crash
           and we should sync files to S3 */
        const result = await sqldb.queryAsync(sql.recover_crash_workspaces, { instance_id: workspace_server_settings.instance_id });
        await async.eachSeries(result.rows, async (ws) => {
            if (ws.state == 'launching') {
                /* We don't know what state the container is in, kill it and let the user
                   retry initializing it */
                try {
                    const container = await _getDockerContainerByLaunchUuid(ws.launch_uuid);
                    await dockerAttemptKillAndRemove(container);
                } catch (err) {
                    debug(`Couldn't find container: ${err}`);
                } finally {
                    /* It doesn't actually matter if the container isn't running or it doesn't exist */
                    await workspaceHelper.updateState(ws.id, 'stopped');
                    await sqldb.queryAsync(sql.clear_workspace_on_shutdown, { workspace_id: ws.id, instance_id: workspace_server_settings.instance_id });
                }
            } else if (ws.state == 'running') {
                if (ws.launch_uuid) {
                    await pushContainerContentsToS3(ws);
                } else {
                    await workspaceHelper.updateState(ws.id, 'stopped');
                    await sqldb.queryAsync(sql.clear_workspace_on_shutdown, { workspace_id: ws.id, instance_id: workspace_server_settings.instance_id });
                }
            }
        });
    },
], function(err, data) {
    if (err) {
        logger.error('Error initializing workspace host:', err, data);
    } else {
        logger.info('Successfully initialized workspace host');
    }
});

// For detecting file changes
let update_queue = {};  // key: path of file on local, value: action ('update' or 'remove').
const workspacePrefix = config.workspaceJobsDirectory;
const watcher = chokidar.watch(workspacePrefix, {
    ignoreInitial: true,
    awaitWriteFinish: true,
    depth: 10,
});
watcher.on('add', filename => {
    // Handle new files
    var key = [filename, false];
    if (key in update_queue && update_queue[key].action == 'skip') {
        delete update_queue[key];
    } else {
        update_queue[key] = {action: 'update'};
    }
});
watcher.on('addDir', filename => {
    // Handle new directory
    var key = [filename, true];
    if (key in update_queue && update_queue[key].action == 'skip') {
        delete update_queue[key];
    } else {
        update_queue[key] = {action: 'update'};
    }
});
watcher.on('change', filename => {
    // Handle file changes
    var key = [filename, false];
    if (key in update_queue && update_queue[key].action == 'skip') {
        delete update_queue[key];
    } else {
        update_queue[key] = {action: 'update'};
    }
});
watcher.on('unlink', filename => {
    // Handle removed files
    var key = [filename, false];
    update_queue[key] = {action: 'delete'};
});
watcher.on('unlinkDir', filename => {
    // Handle removed directory
    var key = [filename, true];
    update_queue[key] = {action: 'delete'};
});
async function autoUpdateJobManagerTimeout() {
    await _autoUpdateJobManager();
    setTimeout(autoUpdateJobManagerTimeout, config.workspaceHostFileWatchIntervalSec * 1000);
}
setTimeout(autoUpdateJobManagerTimeout, config.workspaceHostFileWatchIntervalSec * 1000);

/* Periodic hard-push of files to S3 */

/**
 * Push all of the contents of a container's home directory to S3.
 * @param {object} workspace Workspace object, this should contain at least the launch_uuid and id.
 */
async function pushContainerContentsToS3(workspace) {
    const workspacePath = path.join(workspacePrefix, `workspace-${workspace.launch_uuid}`);
    const settings = _getWorkspaceSettingsAsync(workspace.id);
    try {
        await workspaceHelper.uploadDirectoryToS3Async(workspacePath, `${config.workspaceS3Bucket}/workspace-${workspace.id}`, settings.workspace_sync_ignore);
    } catch (err) {
        /* Ignore any errors that may occur when the directory doesn't exist */
        logger.error(`Error uploading directory: ${err}`);
    }
}

/**
 * Push the contents of all running workspaces to S3.  Workspace home directories are uploaded
 * serially instead of in parallel.
 */
async function pushAllRunningContainersToS3() {
    const result = await sqldb.queryAsync(sql.get_running_workspaces, { instance_id: workspace_server_settings.instance_id });
    await async.eachSeries(result.rows, async (ws) => {
        if (ws.state == 'running') {
            await pushContainerContentsToS3(ws);
        }
    });
}

async function pushAllContainersTimeout() {
    await pushAllRunningContainersToS3();
    setTimeout(pushAllContainersTimeout, config.workspaceHostForceUploadIntervalSec * 1000);
}
setTimeout(pushAllContainersTimeout, config.workspaceHostForceUploadIntervalSec * 1000);

/* Prune stopped and runaway containers */

/**
 * Remove any recently stopped containers.  These are identified by having a non-null launch_uuid
 * and launch_port, but are marked as stopped by the main PrairieLearn instance.
 */
async function pruneStoppedContainers() {
    const instance_id = workspace_server_settings.instance_id;
    const recently_stopped = await sqldb.queryAsync(sql.get_stopped_workspaces, { instance_id });
    await async.each(recently_stopped.rows, async (ws) => {
        let container;
        try {
            /* Try to grab the container, but don't care if it doesn't exist */
            container = await _getDockerContainerByLaunchUuid(ws.launch_uuid);
        } catch (_err) {
            /* No container */
            await sqldb.queryAsync(sql.clear_workspace_on_shutdown, { workspace_id: ws.id, instance_id: workspace_server_settings.instance_id });
            return;
        }
        await pushContainerContentsToS3(ws);
        await dockerAttemptKillAndRemove(container);
        await sqldb.queryAsync(sql.clear_workspace_on_shutdown, { workspace_id: ws.id, instance_id: workspace_server_settings.instance_id });
    });
}

/**
 * Remove any containers that are running but do not have a corresponding launch_uuid in the database.
 */
async function pruneRunawayContainers() {
    const instance_id = workspace_server_settings.instance_id;
    const db_workspaces = await sqldb.queryAsync(sql.get_running_workspaces, { instance_id });
    const db_workspaces_uuid_set = new Set(db_workspaces.rows.map(ws => `workspace-${ws.launch_uuid}`));
    let running_workspaces;
    try {
        running_workspaces = await docker.listContainers();
    } catch (err) {
        /* Nothing to do */
        return;
    }

    await async.each(running_workspaces, async (container_info) => {
        if (container_info.Names.length != 1) return;
        const name = container_info.Names[0].substring(1); /* Remove the preceding forward slash */
        if (!name.startsWith('workspace-') || db_workspaces_uuid_set.has(name)) return;
        await dockerAttemptKillAndRemove(container_info.Id);
    });
}

async function pruneContainersTimeout() {
    await pruneStoppedContainers();
    await pruneRunawayContainers();
    setTimeout(pruneContainersTimeout, config.workspaceHostPruneContainersSec * 1000);
}
setTimeout(pruneContainersTimeout, config.workspaceHostPruneContainersSec * 1000);

/**
 * Looks up a docker container by the UUID used to launch it.
 * Throws an exception if the container was not found or if there
 * are multiple containers with the same UUID (this shouldn't happen?)
 * @param {string} launch_uuid UUID to search by
 * @return Dockerode container object
 */
async function _getDockerContainerByLaunchUuid(launch_uuid) {
    try {
        const containers = await docker.listContainers({
            filters: `name=workspace-${launch_uuid}`,
        });
        return docker.getContainer(containers[0].Id);
    } catch (err) {
        throw new Error(`Could not find unique container by launch UUID: ${launch_uuid}`);
    }
}

/**
 * Attempts to kill and remove a container.  Will fail silently if the container is already stopped
 * or does not exist.  Also removes the container's home directory.
 * @param {string | Dockerode container} input.  Either the ID of the docker container, or an actual Dockerode
 * container object.
 */
async function dockerAttemptKillAndRemove(input) {
    /* Use these awful try-catch blocks because we actually do want to try each */
    let container;
    if (typeof input === 'string') {
        try {
            container = await docker.getContainer(input);
        } catch (_err) {
            /* Docker failed to get the container, oh well. */
            return;
        }
    } else {
        container = input;
    }

    let name = null;
    try {
        name = (await container.inspect()).Name.substring(1);
    } catch (err) {
        debug(`Couldn't obtain container name: ${err}`);
    }

    try {
        await container.kill();
    } catch (err) {
        debug(`Couldn't kill container: ${err}`);
    }

    try {
        await container.remove();
    } catch (err) {
        debug(`Couldn't remove stopped container: ${err}`);
    }

    if (name) {
        const workspaceJobPath = path.join(workspacePrefix, name);
        try {
            await fsPromises.rmdir(workspaceJobPath, { recursive: true });
        } catch (err) {
            debug(`Couldn't remove directory "${workspaceJobPath}": ${err}`);
        }
    }
}

/**
 * Looks up a workspace object by the workspace id.
 * This object contains all columns in the 'workspaces' table as well as:
 * - local_name (container name)
 * - s3_name (subdirectory name on s3)
 * @param {integer} workspace_id Workspace ID to search by.
 * @return {object} Workspace object, as described above.
 */
async function _getWorkspaceAsync(workspace_id) {
    const result = await sqldb.queryOneRowAsync(sql.get_workspace, { workspace_id, instance_id: workspace_server_settings.instance_id });
    const workspace = result.rows[0];
    workspace.local_name = `workspace-${workspace.launch_uuid}`;
    workspace.s3_name = `workspace-${workspace.id}/current`;
    return workspace;
}

/**
 * Allocates and returns an unused port for a workspace.  This will insert the new port into the workspace table.
 * @param {object} workspace Workspace object, should at least contain an id.
 * @return {integer} Port that was allocated to the workspace.
 */
const _allocateContainerPortLock = new LocalLock();
async function _allocateContainerPort(workspace) {
    /* Check if a port is considered free in the database */
    async function check_port_db(port) {
        const params = {
            instance_id: workspace_server_settings.instance_id,
            port,
        };
        const result = await sqldb.queryOneRowAsync(sql.get_is_port_occupied, params);
        return !result.rows[0].port_used;
    }
    /* Spin up a server to check if a port is free */
    async function check_port_server(port) {
        return new Promise((res) => {
            var server = net.createServer();
            server.listen(port, function (_) {
                server.once('close', function () {
                    res(true);
                });
                server.close();
            });
            server.on('error', function (_) {
                res(false);
            });
        });
    }

    await _allocateContainerPortLock.lockAsync();
    let port;
    let done = false;
    /* Max attempts <= 0 means unlimited attempts, > 0 mean a finite number of attempts */
    const max_attempts = (config.workspaceHostMaxPortAllocationAttempts > 0 ? config.workspaceHostMaxPortAllocationAttempts : Infinity);
    for (let i = 0; !done && i < max_attempts; i++) {
        /* Generate a random port from the ranges specified in config */
        port = config.workspaceHostMinPortRange + Math.floor(Math.random() * (config.workspaceHostMaxPortRange - config.workspaceHostMinPortRange));
        if (!(await check_port_db(port))) continue;
        if (!(await check_port_server(port))) continue;
        done = true;
    }
    if (!done) {
        throw new Error(`Failed to allocate port after ${max_attempts} attempts!`);
    }
    await sqldb.queryAsync(sql.set_workspace_launch_port, { workspace_id: workspace.id, launch_port: port, instance_id: workspace_server_settings.instance_id });
    _allocateContainerPortLock.unlock();
    return port;
}

function _checkServer(workspace, callback) {
    const checkMilliseconds = 500;
    const maxMilliseconds = 30000;

    const startTime = (new Date()).getTime();
    function checkWorkspace() {
        request(`http://${workspace_server_settings.server_to_container_hostname}:${workspace.launch_port}/`, function(err, res, _body) {
            if (err) { /* do nothing, because errors are expected while the container is launching */ }
            if (res && res.statusCode) {
                /* We might get all sorts of strange status codes from the server, this is okay since it still means the server is running and we're getting responses. */
                callback(null, workspace);
            } else {
                const endTime = (new Date()).getTime();
                if (endTime - startTime > maxMilliseconds) {
                    callback(new Error(`Max startup time exceeded for workspace_id=${workspace.id}`));
                } else {
                    setTimeout(checkWorkspace, checkMilliseconds);
                }
            }
        });
    }
    setTimeout(checkWorkspace, checkMilliseconds);
}

/**
 * Looks up all the question-specific workspace launch settings associated with a workspace id.
 * @param {integer} workspace_id Workspace ID to search by.
 * @return {object} Workspace launch settings.
 */
async function _getWorkspaceSettingsAsync(workspace_id) {
    const result = await sqldb.queryOneRowAsync(sql.select_workspace_settings, { workspace_id });
    return {
        workspace_image: result.rows[0].workspace_image,
        workspace_port: result.rows[0].workspace_port,
        workspace_home: result.rows[0].workspace_home,
        workspace_graded_files: result.rows[0].workspace_graded_files,
        workspace_args: result.rows[0].workspace_args || '',
        workspace_sync_ignore: result.rows[0].workspace_sync_ignore || [],
    };
}

function _getSettingsWrapper(workspace, callback) {
    async.parallel({
        port: async () => { return await _allocateContainerPort(workspace); },
        settings: async () => { return await _getWorkspaceSettingsAsync(workspace.id); },
    }, (err, results) => {
        if (ERR(err, (err) => logger.error('Error acquiring workspace container settings', err))) return;
        workspace.launch_port = results.port;
        workspace.settings = results.settings;
        callback(null, workspace);
    });
}

function _workspaceFileChangeOwner(filepath, callback) {
    if (config.workspaceJobsDirectoryOwnerUid == 0 ||
        config.workspaceJobsDirectoryOwnerGid == 0) {
        /* No-op if there's nothing to do */
        return callback(null);
    }

    fs.chown(filepath, config.workspaceJobsDirectoryOwnerUid, config.workspaceJobsDirectoryOwnerGid, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}
const _workspaceFileChangeOwnerAsync = util.promisify(_workspaceFileChangeOwner);

async function _downloadFromS3Async(filePath, S3FilePath) {
    if (filePath.slice(-1) == '/') {
        // this is a directory
        filePath = filePath.slice(0, -1);
        try {
            await fsPromises.lstat(filePath);
        } catch(err) {
            await fsPromises.mkdir(filePath, { recursive: true });
            await _workspaceFileChangeOwnerAsync(filePath);
        }
        update_queue[[filePath, true]] = {action: 'skip'};
        return;
    } else {
        // this is a file
        try {
            await fsPromises.lstat(path.dirname(filePath));
        } catch(err) {
            await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
        }
    }

    const s3 = new AWS.S3();
    const downloadParams = {
        Bucket: config.workspaceS3Bucket,
        Key: S3FilePath,
    };
    const fileStream = fs.createWriteStream(filePath);
    const s3Stream = s3.getObject(downloadParams).createReadStream();

    return new Promise((resolve, reject) => {
        s3Stream.on('error', function(err) {
            // This is for errors like no such file on S3, etc
            reject(err);
        });
        s3Stream.pipe(fileStream).on('error', function(err) {
            // This is for errors like the connection is lost, etc
            reject(err);
        }).on('close', function() {
            update_queue[[filePath, false]] = {action: 'skip'};
            _workspaceFileChangeOwner(filePath, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });
}
const _downloadFromS3 = util.callbackify(_downloadFromS3Async);

// Extracts `workspace_id` and `/path/to/file` from `/prefix/workspace-${uuid}/path/to/file`
async function _getWorkspaceByPath(path) {
    let localPath = path.replace(`${workspacePrefix}/`, '').split('/');
    const localName = localPath.shift();
    const launch_uuid = localName.replace('workspace-', '');
    localPath = localPath.join('/');

    try {
        const result = await sqldb.queryOneRowAsync(sql.get_workspace_id_by_uuid, { launch_uuid, instance_id: workspace_server_settings.instance_id });
        return {
            workspace_id: result.rows[0].id,
            local_path: localPath,
        };
    } catch (_err) {
        return {
            workspace_id: null,
            local_path: null,
        };
    }
}

async function _autoUpdateJobManager() {
    var jobs = [];
    for (const key in update_queue) {
        const [path, isDirectory_str] = key.split(',');
        const isDirectory = isDirectory_str == 'true';
        const {workspace_id, local_path} = await _getWorkspaceByPath(path);
        if (workspace_id == null) continue;

        debug(`watch: workspace_id=${workspace_id}, localPath=${local_path}`);
        const workspace = await _getWorkspaceAsync(workspace_id);
        const workspaceSettings = await _getWorkspaceSettingsAsync(workspace_id);
        const s3_name = workspace.s3_name;
        const sync_ignore = workspaceSettings.workspace_sync_ignore;
        debug(`watch: workspace_id=${workspace_id}, isDirectory_str=${isDirectory_str}`);
        debug(`watch: localPath=${local_path}`);
        debug(`watch: syncIgnore=${sync_ignore}`);

        let s3_path = null;
        if (local_path === '') {
            // skip root localPath as it produces new S3 dir with empty name
            continue;
        } else if (sync_ignore.filter(ignored => local_path.startsWith(ignored)).length > 0) {
            continue;
        } else {
            s3_path = `${s3_name}/${local_path}`;
        }

        if (update_queue[key].action == 'update') {
            jobs.push((callback) => {
                awsHelper.uploadToS3(path, isDirectory, s3_path, local_path, callback);
            });
        } else if (update_queue[key].action == 'delete') {
            jobs.push((callback) => {
                awsHelper.deleteFromS3(path, isDirectory, s3_path, local_path, callback);
            });
        }
    }
    update_queue = {};
    try {
        await async.parallel(jobs);
    } catch (err) {
        logger.err(`Error uploading files to S3:\n${err}`);
    }
}

function _recursiveDownloadJobManager(curDirPath, S3curDirPath, callback) {
    const s3 = new AWS.S3();

    var listingParams = {
        Bucket: config.workspaceS3Bucket,
        Prefix: S3curDirPath,
    };

    s3.listObjectsV2(listingParams, (err, data) => {
        if (ERR(err, callback)) return;
        var contents = data['Contents'];
        var ret = [];
        contents.forEach(dict => {
            if ('Key' in dict) {
                var filePath = path.join(curDirPath, dict['Key'].slice(S3curDirPath.length));
                var S3filePath = dict['Key'];
                ret.push([filePath, S3filePath]);
            }
        });
        callback(null, ret);
    });
}

async function _syncInitialZipAsync(workspace) {
    const localName = workspace.local_name;
    const s3Name = workspace.s3_name;
    const localPath = `${workspacePrefix}/${localName}`;
    const zipPath = `${zipPrefix}/${localName}-initial.zip`;
    const s3Path = s3Name.replace('current', 'initial.zip');

    logger.info(`Downloading s3Path=${s3Path} to zipPath=${zipPath}`);
    await _downloadFromS3Async(zipPath, s3Path);

    logger.info(`Unzipping ${zipPath} to ${localPath}`);
    fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: localPath }));

    return workspace;
}
const _syncInitialZip = util.callbackify(_syncInitialZipAsync);

function _syncPullContainer(workspace, callback) {
    _recursiveDownloadJobManager(`${workspacePrefix}/${workspace.local_name}`, workspace.s3_name, (err, jobs_params) => {
        if (ERR(err, callback)) return;
        var jobs = [];
        jobs_params.forEach(([filePath, S3filePath]) => {
            jobs.push( ((callback) => {
                _downloadFromS3(filePath, S3filePath, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }));
        });

        async.parallel(jobs, function(err) {
            if (ERR(err, callback)) return;
            callback(null, workspace);
        });
    });
}

function _queryUpdateWorkspaceHostname(workspace_id, port, callback) {
    const hostname = `${workspace_server_settings.server_to_container_hostname}:${port}`;
    sqldb.query(sql.update_workspace_hostname, {workspace_id, hostname}, function(err, _result) {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function _pullImage(workspace, callback) {
    const workspace_image = workspace.settings.workspace_image;
    if (config.workspacePullImagesFromDockerHub) {
        logger.info(`Pulling docker image: ${workspace_image}`);
        docker.pull(workspace_image, (err, stream) => {
            if (err) {
                logger.error(`Error pulling "${workspace_image}" image; attempting to fall back to cached version.`, err);
                return callback(null);
            }

            docker.modem.followProgress(stream, (err) => {
                if (ERR(err, callback)) return;
                callback(null, workspace);
            }, (output) => {
                logger.info('Docker pull output: ', output);
            });
        });
    } else {
        logger.info('Not pulling docker image');
        callback(null, workspace);
    }
}

function _createContainer(workspace, callback) {
    const localName = workspace.local_name;
    const workspaceDir = (process.env.HOST_JOBS_DIR ? path.join(process.env.HOST_JOBS_DIR, 'workspaces') : config.workspaceJobsDirectory);
    const workspacePath = path.join(workspaceDir, localName); /* Where docker will see the jobs (host path inside docker container) */
    const workspaceJobPath = path.join(workspacePrefix, localName); /* Where we are putting the job files relative to the server (/jobs inside docker container) */
    const containerPath = workspace.settings.workspace_home;
    let args = workspace.settings.workspace_args.trim();
    if (args.length == 0) {
        args = null;
    } else {
        args = args.split(' ');
    }
    let container;

    logger.info(`Creating docker container for image=${workspace.settings.workspace_image}`);
    logger.info(`Exposed port: ${workspace.settings.workspace_port}`);
    logger.info(`Env vars: WORKSPACE_BASE_URL=/pl/workspace/${workspace.id}/container/`);
    logger.info(`User binding: ${config.workspaceJobsDirectoryOwnerUid}:${config.workspaceJobsDirectoryOwnerGid}`);
    logger.info(`Port binding: ${workspace.settings.workspace_port}:${workspace.launch_port}`);
    logger.info(`Volume mount: ${workspacePath}:${containerPath}`);
    logger.info(`Container name: ${localName}`);
    async.series([
        (callback) => {
            logger.info(`Creating directory ${workspaceJobPath}`);
            fs.mkdir(workspaceJobPath, { recursive: true }, (err) => {
                if (err && err.code !== 'EEXIST') {
                    /* Ignore the directory if it already exists */
                    ERR(err, callback); return;
                }
                callback(null);
            });
        },
        (callback) => {
            _workspaceFileChangeOwner(workspaceJobPath, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            docker.createContainer({
                Image: workspace.settings.workspace_image,
                ExposedPorts: {
                    [`${workspace.settings.workspace_port}/tcp`]: {},
                },
                Env: [
                    `WORKSPACE_BASE_URL=/pl/workspace/${workspace.id}/container/`,
                ],
                User: `${config.workspaceJobsDirectoryOwnerUid}:${config.workspaceJobsDirectoryOwnerGid}`,
                HostConfig: {
                    PortBindings: {
                        [`${workspace.settings.workspace_port}/tcp`]: [{'HostPort': `${workspace.launch_port}`}],
                    },
                    Binds: [`${workspacePath}:${containerPath}`],
                    // Copied directly from externalGraderLocal.js
                    Memory: 1 << 30, // 1 GiB
                    MemorySwap: 1 << 30, // same as Memory, so no access to swap
                    KernelMemory: 1 << 29, // 512 MiB
                    DiskQuota: 1 << 30, // 1 GiB
                    IpcMode: 'private',
                    CpuPeriod: 100000, // microseconds
                    CpuQuota: 90000, // portion of the CpuPeriod for this container
                    PidsLimit: 1024,
                },
                Cmd: args, // FIXME: proper arg parsing
                name: localName,
                Volumes: {
                    [containerPath]: {},
                },
            }, (err, newContainer) => {
                if (ERR(err, callback)) return;
                container = newContainer;

                sqldb.query(sql.update_load_count, {workspace_id: workspace.id, count: +1}, function(err, _result) {
                    if (ERR(err, callback)) return;
                    callback(null, container);
                });
            });
        }], (err) => {
            if (ERR(err, callback)) return;
            callback(null, container);
        });
}

function _createContainerWrapper(workspace, callback) {
    async.parallel({
        query: (callback) => {_queryUpdateWorkspaceHostname(workspace.id, workspace.launch_port, callback);},
        container: (callback) => {_createContainer(workspace, callback);},
    }, (err, results) => {
        if (ERR(err, callback)) return;
        workspace.container = results.container;
        callback(null, workspace);
    });
}

function _startContainer(workspace, callback) {
    workspace.container.start((err) => {
        if (ERR(err, callback)) return;
        callback(null, workspace);
    });
}

// Called by the main server the first time a workspace is used by a user
function initSequence(workspace_id, useInitialZip, res) {
    logger.info(`Launching workspace_id=${workspace_id}, useInitialZip=${useInitialZip}`);

    const uuid = uuidv4();
    const workspace = {
        'id': workspace_id,
        'launch_uuid': uuid,
        'local_name': `workspace-${uuid}`,
        's3_name': `workspace-${workspace_id}/current`,
    };

    // send 200 immediately to prevent socket hang up from _pullImage()
    res.status(200).send(`Container for workspace ${workspace_id} initialized.`);

    async.waterfall([
        async () => {
            await sqldb.queryAsync(sql.set_workspace_launch_uuid, { workspace_id, 'launch_uuid': uuid, instance_id: workspace_server_settings.instance_id });
            return workspace;
        },
        (workspace, callback) => {
            if (useInitialZip) {
                logger.info(`Bootstrapping workspace with initial.zip`);
                _syncInitialZip(workspace, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null, workspace);
                });
            } else {
                logger.info(`Syncing workspace from S3`);
                _syncPullContainer(workspace, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null, workspace);
                });
            }
        },
        _getSettingsWrapper,
        _pullImage,
        _createContainerWrapper,
        _startContainer,
        _checkServer,
    ], function(err) {
        if (err) {
            logger.error(`Error for workspace_id=${workspace_id}: ${err}\n${err.stack}`);
            res.status(500).send(err);
        } else {
            sqldb.query(sql.update_workspace_launched_at_now, {workspace_id}, (err) => {
                if (ERR(err)) return;
                logger.info(`Container initialized for workspace_id=${workspace_id}`);
                const state = 'running';
                workspaceHelper.updateState(workspace_id, state);
            });
        }
    });
}

// Called by the main server when the user want to reset the file to default
function resetSequence(workspace_id, res) {
    async.waterfall([
        async () => { return await _getWorkspaceAsync(workspace_id); },
        _syncPullContainer,
    ], function(err) {
        if (err) {
            res.status(500).send(err);
        } else {
            res.status(200).send(`Code of workspace ${workspace_id} reset.`);
        }
    });
}

function gradeSequence(workspace_id, res) {
    /* Define this outside so we can still use it in case of errors */
    let zipPath;
    async.waterfall([
        async () => {
            const workspace = await _getWorkspaceAsync(workspace_id);
            const workspaceSettings = await _getWorkspaceSettingsAsync(workspace_id);
            const timestamp = new Date().toISOString().replace(/[-T:.]/g, '-');
            const zipName = `workspace-${workspace_id}-${timestamp}.zip`;
            zipPath = path.join(zipPrefix, zipName);

            return {
                workspace,
                workspaceSettings,
                workspaceDir: `${workspacePrefix}/${workspace.local_name}`,
                zipPath,
            };
        },
        async (locals) => {
            const archive = archiver('zip');
            locals.archive = archive;
            for (const file of locals.workspaceSettings.workspace_graded_files) {
                try {
                    const file_path = path.join(locals.workspaceDir, file);
                    await fsPromises.lstat(file_path);
                    archive.file(file_path, { name: file });
                    logger.info(`Sending ${file}`);
                } catch (err) {
                    logger.warn(`Graded file ${file} does not exist.`);
                    continue;
                }
            }
            return locals;
        },
        (locals, callback) => {
            /* Write the zip archive to disk */
            const archive = locals.archive;
            let output = fs.createWriteStream(locals.zipPath);
            output.on('close', () => {
                callback(null, locals);
            });
            archive.on('warning', (warn) => {
                logger.warn(warn);
            });
            archive.on('error', (err) => {
                ERR(err, callback);
            });
            archive.pipe(output);
            archive.finalize();
        },
    ], (err, locals) => {
        if (err) {
            logger.error(`Error in gradeSequence: ${err}`);
            res.status(500).send(err);
            try {
                fsPromises.unlink(zipPath);
            } catch (err) {
                logger.error(`Error deleting ${zipPath}`);
            }
        } else {
            res.attachment(locals.zipPath);
            res.status(200).sendFile(locals.zipPath, { root: '/' }, (_err) => {
                try {
                    fsPromises.unlink(locals.zipPath);
                } catch (err) {
                    logger.error(`Error deleting ${locals.zipPath}`);
                }
            });
        }
    });
}
