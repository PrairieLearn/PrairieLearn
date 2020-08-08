const ERR = require('async-stacktrace');
const express = require('express');
const app = express();
const http = require('http');
const request = require('request');
const path = require('path');
const AWS = require('aws-sdk');
const Docker = require('dockerode');
const fs = require('fs');
const async = require('async');
const socketServer = require('../lib/socket-server'); // must load socket server before workspace
const workspace = require('../lib/workspace');
const logger = require('../lib/logger');
const chokidar = require('chokidar');
const fsPromises = require('fs').promises;
var net = require('net');
const { v4: uuidv4 } = require('uuid');
const argv = require('yargs-parser') (process.argv.slice(2));
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

const aws = require('../lib/aws.js');
aws.init((err) => {
    if (err) logger.error(err);
});
const awsConfig = {
    s3ForcePathStyle: true,
    accessKeyId: 'S3RVER',
    secretAccessKey: 'S3RVER',
    endpoint: new AWS.Endpoint('http://localhost:5000'),
};

const config = require('../lib/config');
let configFilename = 'config.json';
if ('config' in argv) {
    configFilename = argv['config'];
}
config.loadConfig(configFilename);

logger.info('Workspace S3 bucket: ' + config.workspaceS3Bucket);

const bodyParser = require('body-parser');
const docker = new Docker();

var id_workspace_mapper = {};
var port_id_mapper = {};

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.post('/', function(req, res) {
    var workspace_id = req.body.workspace_id;
    var action = req.body.action;
    if (workspace_id == undefined) {
        res.status(500).send('Missing workspace_id');
    } else if (action == undefined) {
        res.status(500).send('Missing action');
    } else if (action == 'init') {
        initSequence(workspace_id, res);
    } else if (action == 'reset') {
        resetSequence(workspace_id, res);
    } else if (action == 'destroy') {
        destroySequence(workspace_id, res);
    } else if (action == 'status') {
        res.status(200).send('Running');
    } else {
        res.status(500).send(`Action '${action}' undefined`);
    }
});

let server;

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
        const params = {
            instance_id: config.workspaceDevHostInstanceId,
            hostname: config.workspaceDevHostHostname + ':' + config.workspaceDevHostPort,
        };
        sqldb.query(sql.insert_workspace_hosts, params, function(err, _result) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
    (callback) => {
        server = http.createServer(app);
        server.listen(config.workspaceDevHostPort);
        logger.info(`Listening on port ${config.workspaceDevHostPort}`);
        callback(null);
    },
    (callback) => {
        socketServer.init(server, function(err) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
    (callback) => {
        workspace.init();
        callback(null);
    },
], function(err, data) {
    if (err) {
        logger.error('Error initializing workspace host:', err, data);
    } else {
        logger.info('Successfully initialized workspace host');
    }
});

// For detecting file changes
var update_queue = {};  // key: path of file on local, value: action ('update' or 'remove').
const workspacePrefix = process.env.HOST_JOBS_DIR ? '/jobs' : process.cwd();
var interval = 5; // the base interval of pushing file to S3 and scanning for file change in second
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


async function _getAvailablePort(workspace_id, lowest_usable_port, callback) {

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

    for (var i = lowest_usable_port; i < 65535; i++) {
        if (i in port_id_mapper) {
            continue;
        } else {
            if (await _checkPortAvailability(i)) {
                if (!(workspace_id in id_workspace_mapper)) {
                    id_workspace_mapper[workspace_id] = {};     // To prevent race condition
                }
                id_workspace_mapper[workspace_id].port = i;
                port_id_mapper[i] = workspace_id;
                callback(null, i);
                return;
            } 
        }
    }
    callback('No available port at this time.');
    return;
}

function _checkServer(workspace_id, container, callback) {
    const checkMilliseconds = 500;
    const maxMilliseconds = 30000;

    const startTime = (new Date()).getTime();
    function checkWorkspace() {
        request(`http://${config.workspaceDevContainerHostname}:${id_workspace_mapper[workspace_id].port}/`, function(err, res, _body) {
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

function _querySelectContainerSettings(workspace_id, callback) {
    sqldb.queryOneRow(sql.select_workspace_settings, {workspace_id}, function(err, result) {
        if (ERR(err, callback)) return;

        const syncIgnore = result.rows[0].workspace_sync_ignore || [];
        id_workspace_mapper[workspace_id].syncIgnore = syncIgnore;
        const settings = {
            workspace_image: result.rows[0].workspace_image,
            workspace_port: result.rows[0].workspace_port,
            workspace_home: result.rows[0].workspace_home,
            workspace_graded_files: result.rows[0].workspace_graded_files,
            workspace_args: result.rows[0].workspace_args || '',
        };
        callback(null, settings);
    });
}

function _getSettingsWrapper(workspace_id, callback) {
    async.parallel({
        port: (callback) => {_getAvailablePort(workspace_id, 1024, callback);},
        settings: (callback) => {_querySelectContainerSettings(workspace_id, callback);},
    }, (err, results) => {
        if (ERR(err, (err) => logger.error('Error acquiring workspace container settings', err))) return;
        callback(null, workspace_id, results.port, results.settings);
    });
}

async function _uploadToS3(filePath, isDirectory, S3FilePath, localPath, callback) {
    const s3 = new AWS.S3(awsConfig);

    let body;
    if (isDirectory) {
        body = '';
        S3FilePath += '/';
    } else {
        try {
            body = await fsPromises.readFile(filePath);
        } catch(err) {
            callback(null, [filePath, S3FilePath, err]);
            return;
        }
    }
    var uploadParams = {
        Bucket: config.workspaceS3Bucket,
        Key: S3FilePath,
        Body: body,
    };
    s3.upload(uploadParams, function(err, _data) {
        if (err) {
            callback(null, [filePath, S3FilePath, err]);
            return;
        }
        logger.info(`Uploaded ${localPath}`);
        callback(null, 'OK');
    });
}

function _deleteFromS3(filePath, isDirectory, S3FilePath, localPath, callback) {
    const s3 = new AWS.S3(awsConfig);

    if (isDirectory) {
        S3FilePath += '/';
    }
    var deleteParams = {
        Bucket: config.workspaceS3Bucket,
        Key: S3FilePath,
    };
    s3.deleteObject(deleteParams, function(err, _data) {
        if (err) {
            callback(null, [filePath, S3FilePath, err]);
            return;
        }
        logger.info(`Deleted ${localPath}`);
        callback(null, 'OK');
    });
}

async function _downloadFromS3(filePath, S3FilePath, callback) {
    if (filePath.slice(-1) == '/') {
        // this is a directory
        filePath = filePath.slice(0, -1);
        try {
            await fsPromises.lstat(filePath);
        } catch(err) {
            await fsPromises.mkdir(filePath, { recursive: true });
        }
        callback(null, 'OK');
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

    const s3 = new AWS.S3(awsConfig);

    var downloadParams = {
        Bucket: config.workspaceS3Bucket,
        Key: S3FilePath,
    };
    var fileStream = fs.createWriteStream(filePath);
    var s3Stream = s3.getObject(downloadParams).createReadStream();

    s3Stream.on('error', function(err) {
        // This is for errors like no such file on S3, etc
        callback(null, [filePath, S3FilePath, err]);
        return;
    });

    s3Stream.pipe(fileStream).on('error', function(err) {
        // This is for errors like the connection is lost, etc
        callback(null, [filePath, S3FilePath, err]);
    }).on('close', function() {
        update_queue[[filePath, false]] = {action: 'skip'};
        callback(null, 'OK');
    });
}

// DEPRECATED
async function _recursiveUploadJobManager(curDirPath, S3curDirPath) {
    var ret = [];
    await fsPromises.readdir(curDirPath).forEach(async function (name) {
        var filePath = path.join(curDirPath, name);
        var S3filePath = path.join(S3curDirPath, name);
        var stat = await fsPromises.lstat(filePath);
        if (stat.isFile()) {
            ret.push([filePath, S3filePath]);
        } else if (stat.isDirectory()) {
            ret = ret.concat(_recursiveUploadJobManager(filePath, S3filePath));
        }
    });
    return ret;
}

// Extracts `workspace_id` and `/path/to/file` from `/prefix/workspace-${uuid}/path/to/file`
function _getWorkspaceByPath(path) {
    let localPath = path.replace(`${workspacePrefix}/`, '').split('/');
    const localName = localPath.shift();
    localPath = localPath.join('/');

    if (typeof id_workspace_mapper === 'undefined') {
        logger.error(`_getWorkspaceByLocalPath() error: id_workspace_mapper undefined`);
        return {workspace_id: null, localPath: null};
    }

    const workspace_id = Object.keys(id_workspace_mapper).find(
        key => id_workspace_mapper[key].localName === localName,
    );

    if (typeof workspace_id === 'undefined') {
        logger.error(`_getWorkspaceByLocalPath() error: id_workspace_mapper[workspace_id] undefined`);
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
            logger.error(`watch continue: empty (root) path`);
            continue;
        } else if (syncIgnore.filter(ignored => localPath.startsWith(ignored)).length > 0) {
            continue;
        } else {
            s3Path = `${s3Name}/${localPath}`;
        }

        if (update_queue[key].action == 'update') {
            jobs.push((callback) => {
                _uploadToS3(path, isDirectory, s3Path, localPath, callback);
            });
        } else if (update_queue[key].action == 'delete') {
            jobs.push((callback) => {
                _deleteFromS3(path, isDirectory, s3Path, localPath, callback);
            });
        }
    }
    update_queue = {};
    var status = [];
    async.parallel(jobs, function(_, results) {
        results.forEach((res) => {
            if (res != 'OK') {
                res[2].fileLocalPath = res[0];
                res[2].fileS3Path = res[1];
                status.push(res[2]);
            }
        });
        if (status.length != 0) {
            logger.error(`Error during file sync: ${status}`);
        }
    });
}

function _recursiveDownloadJobManager(curDirPath, S3curDirPath, callback) {
    const s3 = new AWS.S3(awsConfig);

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

function _syncPullContainer(workspace_id, callback) {
    const localName = id_workspace_mapper[workspace_id].localName;
    const s3Name = id_workspace_mapper[workspace_id].s3Name;
    _recursiveDownloadJobManager(`${workspacePrefix}/${localName}`, s3Name, (err, jobs_params) => {
        if (ERR(err, callback)) return;
        var jobs = [];
        jobs_params.forEach(([filePath, S3filePath]) => {
            jobs.push( ((callback) => {
                _downloadFromS3(filePath, S3filePath, (_, status) => {
                    callback(null, status);
                });
            }));
        });

        var status = [];
        async.parallel(jobs, function(_, results) {
            results.forEach((res) => {
                if (res != 'OK') {
                    res[2].fileLocalPath = res[0];
                    res[2].fileS3Path = res[0];
                    status.push(res[2]);
                }
            });
            if (status.length != 0) {
                callback(status);
            } else {
                callback(null, workspace_id);
            }
        });
    });
}

// DEPRECATED
async function _syncPushContainer(workspace_id, callback) {
    const workspacePrefix = process.env.HOST_JOBS_DIR ? '/jobs' : process.cwd();
    const workspaceName= `workspace-${workspace_id}`;
    if (!await fsPromises.lstat(workspaceName)) {
        // we didn't a local copy of the code, DO NOT sync
        callback(null, workspace_id);
        return;
    }
    var jobs_params = _recursiveUploadJobManager(`${workspacePrefix}/${workspaceName}`, workspaceName);
    var jobs = [];
    jobs_params.forEach(([filePath, S3filePath]) => {
        jobs.push((callback) => {
            _uploadToS3(filePath, S3filePath, callback);
        });
    });

    var status = [];
    async.parallel(jobs, function(_, results) {
        results.forEach((res) => {
            if (res != 'OK') {
                res[2].fileLocalPath = res[0];
                res[2].fileS3Path = res[0];
                status.push(res[2]);
            }
        });
        if (status.length != 0) {
            callback(status);
        } else {
            callback(null, workspace_id);
        }
    });
}

function _queryUpdateWorkspaceHostname(workspace_id, port, callback) {
    const hostname = `${config.workspaceDevContainerHostname}:${port}`;
    //const hostname = `${config.workspaceDevHostHostname}:${config.workspaceDevHostPort}`;
    sqldb.query(sql.update_workspace_hostname, {workspace_id, hostname}, function(err, _result) {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function _getContainer(workspace_id, callback) {
    const localName = id_workspace_mapper[workspace_id].localName;
    const container = docker.getContainer(localName);
    callback(null, workspace_id, container);
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
    const workspaceDir = process.env.HOST_JOBS_DIR || process.cwd();
    const workspacePath = path.join(workspaceDir, localName);
    const containerPath = settings.workspace_home;
    let args = settings.workspace_args.trim();
    if (args.length == 0) {
        args = null;
    } else {
        args = args.split(' ');
    }

    logger.info(`Creating docker container for image=${settings.workspace_image}`);
    logger.info(`Exposed port: ${settings.workspace_port}`);
    logger.info(`Env vars: WORKSPACE_BASE_URL=/workspace/${workspace_id}/container/`);
    logger.info(`Port binding: ${settings.workspace_port}:${port}`);
    logger.info(`Volume mount: ${workspacePath}:${containerPath}`);
    logger.info(`Container name: ${localName}`);
    docker.createContainer({
        Image: settings.workspace_image,
        ExposedPorts: {
            [`${settings.workspace_port}/tcp`]: {},
        },
        Env: [
            `WORKSPACE_BASE_URL=/workspace/${workspace_id}/container/`,
        ],
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
    }, (err, container) => {
        if (ERR(err, callback)) return;

        id_workspace_mapper[workspace_id].port = port;
        id_workspace_mapper[workspace_id].settings = settings;
        port_id_mapper[port] = workspace_id;
        sqldb.query(sql.update_load_count, {workspace_id, count: +1}, function(err, _result) {
            if (ERR(err, callback)) return;
            callback(null, container);
        });
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

function _delContainer(workspace_id, container, callback) {
    // Require Node.js 12.10.0 or later otherwise it will complain that the folder isn't empty
    // Commented out because we don't want to delete on S3 in fs.watch's callback
    // fs.rmdirSync(`${workspacePrefix}/${workspaceName}`, { recursive: true });

    container.remove((err) => {
        if (ERR(err, callback)) return;
        delete(port_id_mapper[id_workspace_mapper[workspace_id].port]);
        delete(id_workspace_mapper[workspace_id]);
        sqldb.query(sql.update_load_count, {workspace_id, count: -1}, function(err, _result) {
            if (ERR(err, callback)) return;
            callback(null, workspace_id, container);
        });
    });
}

function _startContainer(workspace_id, container, callback) {
    container.start((err) => {
        if (ERR(err, callback)) return;
        callback(null, workspace_id, container);
    });
}

function _stopContainer(workspace_id, container, callback) {
    container.stop((err) => {
        if (ERR(err, callback)) return;
        callback(null, workspace_id, container);
    });
}

// Called by the main server the first time a workspace is used by a user
function initSequence(workspace_id, res) {
    logger.info(`Launching workspace_id=${workspace_id}`);

    id_workspace_mapper[workspace_id] = {};
    id_workspace_mapper[workspace_id].localName = `workspace-${uuidv4()}`;
    id_workspace_mapper[workspace_id].s3Name = `workspace-${workspace_id}`;
    
    // send 200 immediately to prevent socket hang up from _pullImage()
    res.status(200).send(`Container for workspace ${workspace_id} initialized.`);

    async.waterfall([
        (callback) => {_syncPullContainer(workspace_id, callback);},
        _getSettingsWrapper,
        _pullImage,
        _createContainerWrapper,
        _startContainer,
        _checkServer,
    ], function(err) {
        if (err) {
            logger.error(`Error for workspace_id=${workspace_id}: ${err}`);
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

// Usage unclear, maybe should be called automatically by the workspace host?
// Maybe should also remove the local copy of the code as well?
function destroySequence(workspace_id, res) {
    async.waterfall([
        (callback) => {_syncPushContainer(workspace_id, callback);},
        _getContainer,
        _stopContainer,
        _delContainer,
    ], function(err) {
        if (err) {
            res.status(500).send(err);
        } else {
            res.status(200).send(`Container for workspace ${workspace_id} destroyed.`);
        }
    });
}
