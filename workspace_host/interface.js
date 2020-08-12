const ERR = require('async-stacktrace');
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
const workspace = require('../lib/workspace');
const logger = require('../lib/logger');
const chokidar = require('chokidar');
const fsPromises = require('fs').promises;
var net = require('net');
const { v4: uuidv4 } = require('uuid');
const argv = require('yargs-parser') (process.argv.slice(2));
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const archiver = require('archiver');
const unzipper = require('unzipper');

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

var id_workspace_mapper = {};
var port_id_mapper = {};

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// TODO: refactor into RESTful endpoints (https://github.com/PrairieLearn/PrairieLearn/pull/2841#discussion_r467245108)
app.post('/', function(req, res) {
    const workspace_id = req.body.workspace_id;
    const state = req.body.state;
    const action = req.body.action;
    if (workspace_id == undefined) {
        res.status(500).send('Missing workspace_id');
    } else if (action == undefined) {
        res.status(500).send('Missing action');
    } else if (action == 'init') {
        const useInitialZip = (state == 'uninitialized');
        initSequence(workspace_id, useInitialZip, res);
    } else if (action == 'reset') {
        resetSequence(workspace_id, res);
    } else if (action == 'destroy') {
        /* TODO: Add an actual destroy sequence? */
        res.status(500).send('Action "destroy" unimplemented');
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
        util.callbackify(workspace.init)(err => {
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
const interval = 5; // the base interval of pushing file to S3 and scanning for file change in second
const watcher = chokidar.watch(workspacePrefix, {ignoreInitial: true,
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
setInterval(_autoUpdateJobManager, interval * 1000);


async function _getAvailablePort(workspace_id, lowest_usable_port) {
    function _checkPortAvailability(port) {
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

    for (let i = lowest_usable_port; i < 65535; i++) {
        if (i in port_id_mapper) {
            continue;
        } else {
            if (await _checkPortAvailability(i)) {
                if (!(workspace_id in id_workspace_mapper)) {
                    id_workspace_mapper[workspace_id] = {};     // To prevent race condition
                }
                id_workspace_mapper[workspace_id].port = i;
                port_id_mapper[i] = workspace_id;
                return i;
            }
        }
    }
    throw new Error('No available port at this time.');
}

function _checkServer(workspace_id, container, callback) {
    const checkMilliseconds = 500;
    const maxMilliseconds = 30000;

    const startTime = (new Date()).getTime();
    function checkWorkspace() {
        request(`http://${workspace_server_settings.server_to_container_hostname}:${id_workspace_mapper[workspace_id].port}/`, function(err, res, _body) {
            if (err) { /* do nothing, because errors are expected while the container is launching */ }
            if (res && res.statusCode) {
                /* We might get all sorts of strange status codes from the server, this is okay since it still means the server is running and we're getting responses. */
                callback(null, workspace_id, container);
            } else {
                const endTime = (new Date()).getTime();
                if (endTime - startTime > maxMilliseconds) {
                    callback(new Error(`Max startup time exceeded for workspace_id=${workspace_id}`));
                } else {
                    setTimeout(checkWorkspace, checkMilliseconds);
                }
            }
        });
    }
    setTimeout(checkWorkspace, checkMilliseconds);
}

async function _querySelectContainerSettings(workspace_id) {
    const result = await sqldb.queryOneRowAsync(sql.select_workspace_settings, {workspace_id});
    const syncIgnore = result.rows[0].workspace_sync_ignore || [];
    id_workspace_mapper[workspace_id].syncIgnore = syncIgnore;
    const settings = {
        workspace_image: result.rows[0].workspace_image,
        workspace_port: result.rows[0].workspace_port,
        workspace_home: result.rows[0].workspace_home,
        workspace_graded_files: result.rows[0].workspace_graded_files,
        workspace_args: result.rows[0].workspace_args || '',
    };

    return settings;
}

function _getSettingsWrapper(workspace_id, callback) {
    async.parallel({
        port: async () => { return await _getAvailablePort(workspace_id, 1024); },
        settings: async () => { return await _querySelectContainerSettings(workspace_id); },
    }, (err, results) => {
        if (ERR(err, (err) => logger.error('Error acquiring workspace container settings', err))) return;
        callback(null, workspace_id, results.port, results.settings);
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
function _getWorkspaceByPath(path) {
    let localPath = path.replace(`${workspacePrefix}/`, '').split('/');
    const localName = localPath.shift();
    localPath = localPath.join('/');

    if (typeof id_workspace_mapper === 'undefined') {
        logger.error(`_getWorkspaceByLocalPath() error: id_workspace_mapper undefined for localName=${localName}, path=${path}`);
        return {workspace_id: null, localPath: null};
    }

    const workspace_id = Object.keys(id_workspace_mapper).find(
        key => id_workspace_mapper[key].localName === localName,
    );

    if (typeof workspace_id === 'undefined') {
        logger.error(`_getWorkspaceByLocalPath() error: id_workspace_mapper[workspace_id] undefined for localName=${localName}, path=${path}`);
        return {workspace_id: null, localPath: null};
    }

    return {workspace_id, localPath};
}

function _autoUpdateJobManager() {
    var jobs = [];
    for (const key in update_queue) {
        const [path, isDirectory_str] = key.split(',');
        const isDirectory = isDirectory_str == 'true';
        const {workspace_id, localPath} = _getWorkspaceByPath(path);
        if (workspace_id == null) continue;
        debug(`watch: workspace_id=${workspace_id}, localPath=${localPath}`);
        const s3Name = id_workspace_mapper[workspace_id].s3Name;
        const syncIgnore = id_workspace_mapper[workspace_id].syncIgnore || [];
        debug(`watch: workspace_id=${workspace_id}, isDirectory_str=${isDirectory_str}`);
        debug(`watch: localPath=${localPath}`);
        debug(`watch: syncIgnore=${syncIgnore}`);

        let s3Path;
        if (!workspace_id) {
            logger.error(`watch return: workspace_id not mapped yet`);
            return;
        } else if (localPath === '') {
            // skip root localPath as it produces new S3 dir with empty name
            continue;
        } else if (syncIgnore.filter(ignored => localPath.startsWith(ignored)).length > 0) {
            continue;
        } else {
            s3Path = `${s3Name}/${localPath}`;
        }

        if (update_queue[key].action == 'update') {
            jobs.push((callback) => {
                awsHelper.uploadToS3(path, isDirectory, s3Path, localPath, callback);
            });
        } else if (update_queue[key].action == 'delete') {
            jobs.push((callback) => {
                awsHelper.deleteFromS3(path, isDirectory, s3Path, localPath, callback);
            });
        }
    }
    update_queue = {};
    async.parallel(jobs, function(err) {
        if (err) logger.err(err);
    });
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

async function _syncInitialZipAsync(workspace_id) {
    const localName = id_workspace_mapper[workspace_id].localName;
    const s3Name = id_workspace_mapper[workspace_id].s3Name;
    const localPath = `${workspacePrefix}/${localName}`;
    const zipPath = `${zipPrefix}/${localName}-initial.zip`;
    const s3Path = s3Name.replace('current', 'initial.zip');

    logger.info(`Downloading s3Path=${s3Path} to zipPath=${zipPath}`);
    await _downloadFromS3Async(zipPath, s3Path);

    logger.info(`Unzipping ${zipPath} to ${localPath}`);
    fs.createReadStream(zipPath).pipe(unzipper.Extract({ path: localPath }));

    return workspace_id;
}
const _syncInitialZip = util.callbackify(_syncInitialZipAsync);

function _syncPullContainer(workspace_id, callback) {
    const localName = id_workspace_mapper[workspace_id].localName;
    const s3Name = id_workspace_mapper[workspace_id].s3Name;
    _recursiveDownloadJobManager(`${workspacePrefix}/${localName}`, s3Name, (err, jobs_params) => {
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
            callback(null, workspace_id);
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

function _pullImage(workspace_id, port, settings, callback) {
    const workspace_image = settings.workspace_image;
    if (config.workspacePullImagesFromDockerHub) {
        logger.info(`Pulling docker image: ${workspace_image}`);
        docker.pull(workspace_image, (err, stream) => {
            if (err) {
                logger.error(`Error pulling "${workspace_image}" image; attempting to fall back to cached version.`, err);
                return callback(null);
            }

            docker.modem.followProgress(stream, (err) => {
                if (ERR(err, callback)) return;
                callback(null, workspace_id, port, settings);
            }, (output) => {
                logger.info('Docker pull output: ', output);
            });
        });
    } else {
        logger.info('Not pulling docker image');
        return callback(null, workspace_id, port, settings);
    }
}

function _createContainer(workspace_id, port, settings, callback) {
    const localName = id_workspace_mapper[workspace_id].localName;
    const workspaceDir = (process.env.HOST_JOBS_DIR ? path.join(process.env.HOST_JOBS_DIR, 'workspaces') : config.workspaceJobsDirectory);
    const workspacePath = path.join(workspaceDir, localName); /* Where docker will see the jobs (host path inside docker container) */
    const workspaceJobPath = path.join(workspacePrefix, localName); /* Where we are putting the job files relative to the server (/jobs inside docker container) */
    const containerPath = settings.workspace_home;
    let args = settings.workspace_args.trim();
    if (args.length == 0) {
        args = null;
    } else {
        args = args.split(' ');
    }
    let container;

    logger.info(`Creating docker container for image=${settings.workspace_image}`);
    logger.info(`Exposed port: ${settings.workspace_port}`);
    logger.info(`Env vars: WORKSPACE_BASE_URL=/pl/workspace/${workspace_id}/container/`);
    logger.info(`User binding: ${config.workspaceJobsDirectoryOwnerUid}:${config.workspaceJobsDirectoryOwnerGid}`);
    logger.info(`Port binding: ${settings.workspace_port}:${port}`);
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
                Image: settings.workspace_image,
                ExposedPorts: {
                    [`${settings.workspace_port}/tcp`]: {},
                },
                Env: [
                    `WORKSPACE_BASE_URL=/pl/workspace/${workspace_id}/container/`,
                ],
                User: `${config.workspaceJobsDirectoryOwnerUid}:${config.workspaceJobsDirectoryOwnerGid}`,
                HostConfig: {
                    PortBindings: {
                        [`${settings.workspace_port}/tcp`]: [{'HostPort': `${port}`}],
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

                id_workspace_mapper[workspace_id].port = port;
                id_workspace_mapper[workspace_id].settings = settings;
                port_id_mapper[port] = workspace_id;
                sqldb.query(sql.update_load_count, {workspace_id, count: +1}, function(err, _result) {
                    if (ERR(err, callback)) return;
                    callback(null, container);
                });
            });
        }], (err) => {
            if (ERR(err, callback)) return;
            callback(null, container);
        });
}

function _createContainerWrapper(workspace_id, port, settings, callback) {
    async.parallel({
        query: (callback) => {_queryUpdateWorkspaceHostname(workspace_id, port, callback);},
        container: (callback) => {_createContainer(workspace_id, port, settings, callback);},
    }, (err, results) => {
        if (ERR(err, callback)) return;
        callback(null, workspace_id, results.container);
    });
}

function _startContainer(workspace_id, container, callback) {
    container.start((err) => {
        if (ERR(err, callback)) return;
        callback(null, workspace_id, container);
    });
}

// Called by the main server the first time a workspace is used by a user
function initSequence(workspace_id, useInitialZip, res) {
    logger.info(`Launching workspace_id=${workspace_id}, useInitialZip=${useInitialZip}`);

    id_workspace_mapper[workspace_id] = {};
    id_workspace_mapper[workspace_id].localName = `workspace-${uuidv4()}`;
    id_workspace_mapper[workspace_id].s3Name = `workspace-${workspace_id}/current`;

    // send 200 immediately to prevent socket hang up from _pullImage()
    res.status(200).send(`Container for workspace ${workspace_id} initialized.`);

    async.waterfall([
        (callback) => {
            if (useInitialZip) {
                logger.info(`Bootstrapping workspace with initial.zip`);
                _syncInitialZip(workspace_id, callback);
            } else {
                logger.info(`Syncing workspace from S3`);
                _syncPullContainer(workspace_id, callback);
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
                workspace.updateState(workspace_id, state);
            });
        }
    });
}

// Called by the main server when the user want to reset the file to default
function resetSequence(workspace_id, res) {
    async.waterfall([
        (callback) => {_syncPullContainer(workspace_id, callback);},
    ], function(err) {
        if (err) {
            res.status(500).send(err);
        } else {
            res.status(200).send(`Code of workspace ${workspace_id} reset.`);
        }
    });
}

function gradeSequence(workspace_id, res) {
    const workspaceDir = `${workspacePrefix}/${id_workspace_mapper[workspace_id].localName}`;
    const gradedFilesList = id_workspace_mapper[workspace_id].settings.workspace_graded_files;
    const timestamp = new Date().toISOString().replace(/[-T:.]/g, '-');
    const zipName = `workspace-${workspace_id}-${timestamp}.zip`;
    const zipPath = path.join(zipPrefix, zipName);

    debug(`gradeSequence: workspaceDir=${workspaceDir}`);
    debug(`gradeSequence: gradedFilesList=${gradedFilesList}`);
    debug(`gradeSequence: zipPath=${zipPath}`);
    logger.info(`Sending files for grading as ${zipPath}`);

    let archive = archiver('zip');
    async.series([
        async () => {
            /* Start loading the graded files into the archive */
            for (const file of gradedFilesList) {
                try {
                    const file_path = path.join(workspaceDir, file);
                    await fsPromises.lstat(file_path);
                    archive.file(file_path, { name: file });
                    logger.info(`Sending ${file}`);
                } catch (err) {
                    logger.warn(`Graded file ${file} does not exist.`);
                    continue;
                }
            }
            return null;
        },
        (callback) => {
            /* Write the zip archive to disk */
            let output = fs.createWriteStream(zipPath);
            output.on('close', () => {
                callback(null);
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
    ], (err) => {
        if (err) {
            logger.error(`Error in gradeSequence: ${err}`);
            res.status(500).send(err);
            try {
                fsPromises.unlink(zipPath);
            } catch (err) {
                logger.error(`Error deleting ${zipPath}`);
            }
        } else {
            res.attachment(zipPath);
            res.status(200).sendFile(zipPath, { root: '/' }, (_err) => {
                try {
                    fsPromises.unlink(zipPath);
                } catch (err) {
                    logger.error(`Error deleting ${zipPath}`);
                }
            });
        }
    });
}
