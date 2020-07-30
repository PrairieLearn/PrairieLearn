const ERR = require('async-stacktrace');
const express = require('express');
const app = express();
const request = require('request');
const port = 8081;
const path = require('path');
const AWS = require('aws-sdk');
const Docker = require('dockerode');
const fs = require('fs');
const async = require('async');
const logger = require('../lib/logger');
const { createProxyMiddleware } = require('http-proxy-middleware');
const chokidar = require('chokidar');
const fsPromises = require('fs').promises;
var net = require('net');
const { v4: uuidv4 } = require('uuid');
const argv = require('yargs-parser') (process.argv.slice(2));

const aws = require('../lib/aws.js');
aws.init((err) => {
    if (err) logger.debug(err);
});

const config = require('../lib/config');
let configFilename = 'config.json';
if ('config' in argv) {
    configFilename = argv['config'];
}
config.loadConfig(configFilename);

const workspaceBucketName = config.workspaceS3Bucket;
if (workspaceBucketName == '') {
    logger.warn('Workspace bucket is not configed correctly. Check config.json.');
} else {
    logger.info('Workspace bucket is configed to: ' + workspaceBucketName);
}

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

async.series([
    // FIXME: this sqldb init function is duped from server.js
    function(callback) {
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
    function(callback) {
        const params = {
            hostname: config.workspaceContainerLocalhost,
            // hostname: config.workspaceNativeLocalhost,
        };
        sqldb.query(sql.insert_workspace_hosts, params, function(err, _result) {
            if (ERR(err, callback)) return;
            callback(null);
        });
    },
], function(err, data) {
    if (err) {
        logger.error('Error initializing PrairieLearn database:', err, data);
    } else {
        logger.info('Initialized PrairieLearn database');
    }
});

const bodyParser = require('body-parser');
const docker = new Docker();

var id_workspace_mapper = {};
var port_id_mapper = {};
const workspaceProxyOptions = {
    target: 'invalid',
    ws: true,
    pathRewrite: (path) => {
        //logger.info(`proxy pathRewrite: path='${path}'`);
        var match = path.match('/workspace/([0-9]+)/container/(.*)');
        if (match) {
            const workspace_id = parseInt(match[1]);
            if (!(workspace_id in id_workspace_mapper)) {
                logger.info(`proxy pathRewrite: Could not find workspace_id=${workspace_id}`);
                return path;
            }
            const workspace = id_workspace_mapper[workspace_id];
            //logger.info(`proxy pathRewrite: Matched workspace_id=${workspace_id}, id_workspace_mapper[${workspace_id}].port=${id_workspace_mapper[workspace_id].port}`);
            if (!workspace.settings.workspace_url_rewrite) {
                logger.info(`proxy pathRewrite: URL rewriting disabled for workspace_id=${workspace_id}`);
                return path;
            }
            var pathSuffix = match[2];
            const newPath = '/' + pathSuffix;
            //logger.info(`proxy pathRewrite: Matched suffix='${pathSuffix}'; returning newPath: ${newPath}`);
            return newPath;
        } else {
            logger.info(`proxy pathRewrite: No match; returning path: ${path}`);
            return path;
        }
    },
    logProvider: _provider => logger,
    router: (req) => {
        //logger.info(`proxy router: Creating workspace router for URL: ${req.url}`);
        var url = req.url;
        var workspace_id = parseInt(url.replace('/workspace/', ''));
        //logger.info(`workspace_id: ${workspace_id}`);
        if (workspace_id in id_workspace_mapper) {
            url = `http://${config.workspaceNativeLocalhost}:${id_workspace_mapper[workspace_id].port}/`;
            //logger.info(`proxy router: Router URL: ${url}`);
            return url;
        } else {
            logger.info(`proxy router: Router URL is empty`);
            return '';
        }
    },
};
const workspaceProxy = createProxyMiddleware(workspaceProxyOptions);
app.use('/workspace/([0-9])+/*', workspaceProxy);

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

app.listen(port, () => console.log(`Listening on http://${config.workspaceNativeLocalhost}:${port}/`));

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
        console.log ('File created ' + filename);
        update_queue[key] = {action: 'update'};
    }
});
watcher.on('addDir', filename => {
    // Handle new directory
    var key = [filename, true];
    if (key in update_queue && update_queue[key].action == 'skip') {
        delete update_queue[key];
    } else {
        console.log ('Directory created ' + filename);
        update_queue[key] = {action: 'update'};
    }
});
watcher.on('change', filename => {
    // Handle file changes
    var key = [filename, false];
    if (key in update_queue && update_queue[key].action == 'skip') {
        delete update_queue[key];
    } else {
        console.log ('File changed ' + filename);
        update_queue[key] = {action: 'update'};
    }
});
watcher.on('unlink', filename => {
    // Handle removed files
    console.log ('File removed ' + filename);
    var key = [filename, false];
    update_queue[key] = {action: 'delete'};
});
watcher.on('unlinkDir', filename => {
    // Handle removed directory
    console.log ('Directory removed ' + filename);
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
        request(`http://${config.workspaceNativeLocalhost}:${id_workspace_mapper[workspace_id].port}/`, function(err, res, _body) {
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

function _queryContainerSettings(workspace_id, callback) {
    sqldb.queryOneRow(sql.select_workspace_settings, {workspace_id}, function(err, result) {
        if (ERR(err, callback)) return;
        logger.info(`Query results: ${JSON.stringify(result.rows[0])}`);

        /* We can't use the || idiom for url_rewrite because it'll override if false */
        let url_rewrite = result.rows[0].workspace_url_rewrite;
        if (url_rewrite == null) {
            url_rewrite = true;
        }

        const settings = {
            workspace_image: result.rows[0].workspace_image,
            workspace_port: result.rows[0].workspace_port,
            workspace_home: result.rows[0].workspace_home,
            workspace_graded_files: result.rows[0].workspace_graded_files,
            workspace_args: result.rows[0].workspace_args || '',
            workspace_url_rewrite: url_rewrite,
        };
        callback(null, settings);
    });
}

function _getContainerSettings(workspace_id, callback) {
    async.parallel({
        port: (callback) => {_getAvailablePort(workspace_id, 1024, callback);},
        settings: (callback) => {_queryContainerSettings(workspace_id, callback);},
    }, (err, results) => {
        if (ERR(err, (err) => logger.error('Error acquiring workspace container settings', err))) return;
        callback(null, workspace_id, results.port, results.settings);
    });
}

async function _uploadToS3(filePath, isDirectory, S3FilePath, callback) {
    const s3 = new AWS.S3();
    let body;
    if (isDirectory) {
        body = '';
        S3FilePath += '/';
    } else {
        try {
            body = await fsPromises.readFile(filePath);
        } catch(err) {
            console.log(err);
            callback(null, [filePath, S3FilePath, err]);
            return;
        }
    }
    var uploadParams = {
        Bucket: workspaceBucketName,
        Key: S3FilePath,
        Body: body,
    };
    s3.upload(uploadParams, function(err, _data) {
        if (err) {
            callback(null, [filePath, S3FilePath, err]);
            return;
        }
        console.log(`watch: ${filePath} uploaded!`);
        callback(null, 'OK');
    });
}

function _deleteFromS3(filePath, isDirectory, S3FilePath, callback) {
    const s3 = new AWS.S3();
    if (isDirectory) {
        S3FilePath += '/';
    }
    var deleteParams = {
        Bucket: workspaceBucketName,
        Key: S3FilePath,
    };
    s3.deleteObject(deleteParams, function(err, _data) {
        if (err) {
            callback(null, [filePath, S3FilePath, err]);
            return;
        }
        console.log(`watch: ${filePath} deleted!`);
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
    const s3 = new AWS.S3();
    var downloadParams = {
        Bucket: workspaceBucketName,
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
        return;
    }

    const workspace_id = Object.keys(id_workspace_mapper).find(
        key => id_workspace_mapper[key].localName === localName,
    );

    if (typeof workspace_id === 'undefined') {
        logger.error(`_getWorkspaceByLocalPath() error: id_workspace_mapper[workspace_id] undefined`);
        return;
    }

    return {workspace_id, localPath};
}

function _autoUpdateJobManager() {
    var jobs = [];
    console.log(`watch update_queue: ${JSON.stringify(update_queue)}`);
    for (const key in update_queue) {
        const [path, isDirectory_str] = key.split(',');
        const isDirectory = isDirectory_str == 'true';
        const {workspace_id, localPath} = _getWorkspaceByPath(path);
        const s3Name = id_workspace_mapper[workspace_id].s3Name;
        logger.info(`watch: workspace_id=${workspace_id}, localPath=${localPath}, isDirectory_str=${isDirectory_str}`);

        let s3Path;
        if (!workspace_id) {
            logger.info(`watch return: workspace_id not mapped yet`);
            return;
        } else if (localPath === '') {
            logger.info(`watch continue: empty (root) path`);
            continue;
        } else {
            s3Path = `${s3Name}/${localPath}`;
            logger.info(`watch s3Path: ${s3Path}`);
        }

        if (update_queue[key].action == 'update') {
            jobs.push((mockCallback) => {
                _uploadToS3(path, isDirectory, s3Path, mockCallback);
            });
        } else if (update_queue[key].action == 'delete') {
            jobs.push((mockCallback) => {
                _deleteFromS3(path, isDirectory, s3Path, mockCallback);
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
            logger.error(status);
        }
    });
}

function _recursiveDownloadJobManager(curDirPath, S3curDirPath, callback) {
    const s3 = new AWS.S3();
    var listingParams = {
        Bucket: workspaceBucketName,
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
            jobs.push( ((mockCallback) => {
                _downloadFromS3(filePath, S3filePath, (_, status) => {
                    mockCallback(null, status);
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
        jobs.push( ((mockCallback) => {
            _uploadToS3(filePath, S3filePath, mockCallback);
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
}

function _getContainer(workspace_id, callback) {
    const localName = id_workspace_mapper[workspace_id].localName;
    const container = docker.getContainer(localName);
    callback(null, workspace_id, container);
}

function _createContainer(workspace_id, port, settings, callback) {
    logger.info(`_createContainer(workspace_id=${workspace_id}, port=${port})`);

    const localName = id_workspace_mapper[workspace_id].localName;
    logger.info(`_createContainer localName=${localName}`);

    const workspaceDir = process.env.HOST_JOBS_DIR || process.cwd();
    const workspacePath = path.join(workspaceDir, localName);
    const containerPath = settings.workspace_home;
    logger.info(`Workspace path is configed to: ${workspacePath}`);
    logger.info(`Workspace container is configed to: ${JSON.stringify(settings)}`);
    let args = settings.workspace_args.trim();
    if (args.length == 0) {
        args = null;
    } else {
        args = args.split(' ');
    }

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
        if (err) {
            if (err.toString().includes('is already in use')) {
                logger.info(`_createContainer: received error: ${err}`);
                _getContainer(workspace_id, callback);
            } else {
                callback(err);
            }
        } else {
            id_workspace_mapper[workspace_id].port = port;
            id_workspace_mapper[workspace_id].settings = settings;
            port_id_mapper[port] = workspace_id;
            logger.info(`Set id_workspace_mapper[${workspace_id}].port = ${port}`);
            logger.info(`Set port_id_mapper[${port}] = ${workspace_id}`);
            callback(null, workspace_id, container);
        }
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
        callback(null, workspace_id, container);
    });
}

function _startContainer(workspace_id, container, callback) {
    container.start((err) => {
        if (err) {
            if (err.toString().includes('already started')) {
                callback(null, workspace_id, container);
            } else {
                callback(err);
            }
        } else {
            callback(null, workspace_id, container);
        }
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
    if (!(workspace_id in id_workspace_mapper)) {
        id_workspace_mapper[workspace_id] = {};
        id_workspace_mapper[workspace_id].localName = `workspace-${uuidv4()}`;
        id_workspace_mapper[workspace_id].s3Name = `workspace-${workspace_id}`;
        logger.info(`id_workspace_mapper: ${JSON.stringify(id_workspace_mapper)}`);
    }
    
    async.waterfall([
        (callback) => {_syncPullContainer(workspace_id, callback);},
        _getContainerSettings,
        _createContainer,
        _startContainer,
        _checkServer,
    ], function(err) {
        if (err) {
            logger.error(`Error for workspace_id=${workspace_id}: ${err}`);
            res.status(500).send(err);
        } else {
            logger.info(`Container initialized for workspace_id=${workspace_id}`);
            res.status(200).send(`Container for workspace ${workspace_id} initialized.`);
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
