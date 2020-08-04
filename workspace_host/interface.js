const ERR = require('async-stacktrace');
const express = require('express');
const app = express();
const request = require('request');
const path = require('path');
const AWS = require('aws-sdk');
const Docker = require('dockerode');
const fs = require('fs');
const async = require('async');
const logger = require('../lib/logger');
const chokidar = require('chokidar');
const fsPromises = require('fs').promises;
var net = require('net');
const { v4: uuidv4 } = require('uuid');
const argv = require('yargs-parser') (process.argv.slice(2));

const aws = require('../lib/aws.js');
aws.init((err) => {
    if (err) logger.debug(err);
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
            instance_id: config.workspaceDevHostInstanceId,
            hostname: config.workspaceDevHostHostname + ':' + config.workspaceDevHostPort,
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

app.listen(config.workspaceDevHostPort, () => console.log(`Listening on port ${config.workspaceDevHostPort}`));

// For detecting file changes
class jobQueue {
    constructor(skip_ttl=5) {
        this.ttl = skip_ttl;     // ttl for item on skip_queue
        this.update_queue = {};  // key: [path of file on local, isDirectory] value: action ('update' or 'delete').
        this.skip_queue = {}; // key: [path of file on local, isDirectory], value: {'skipUpdate':boolean, 'skipDelete': boolean}
    }

    get updateQueue() {
        return this.update_queue;
    }

    resetUpdateQueue() {
        this.update_queue = {};
        for (var key in this.skip_queue) {
            this.skip_queue[key].ttl -= 1;
            if (this.skip_queue[key].ttl == 0) {
                delete this.skip_queue[key];
            }
        }
    }

    addSkip(filePath, isDirectory, action) {
        const key = [filePath, isDirectory];
        if (!(key in this.skip_queue)) {
            this.skip_queue[key] = {skipUpdate: false, skipDelete: false, ttl: this.ttl};
        }
        if (action == 'update') {
            this.skip_queue[key].skipUpdate = true;
        } else if (action == 'delete') {
            this.skip_queue[key].skipDelete = true;
        }
    }

    addUpdate(filePath, isDirectory) {
        const key = [filePath, isDirectory];
        if (key in this.skip_queue && this.skip_queue[key].skipUpdate) {
            this.skip_queue[key].skipUpdate = false;
            if (!this.skip_queue[key].skipDelete) {
                delete this.skip_queue[key];
            }
        } else {
            this.update_queue[key] = {action: 'update'};
        }
    }

    addDelete(filePath, isDirectory) {
        const key = [filePath, isDirectory];
        if (key in this.skip_queue && this.skip_queue[key].skipDelete) {
            this.skip_queue[key].skipDelete = false;
            if (!this.skip_queue[key].skipUpdate) {
                delete this.skip_queue[key];
            }
        } else {
            this.update_queue[key] = {action: 'delete'};
        }
    }
}

var queue = new jobQueue(10);
const workspacePrefix = process.env.HOST_JOBS_DIR ? '/jobs' : process.cwd();
var interval = 5; // the base interval of pushing file to S3 and scanning for file change in second
const watcher = chokidar.watch(workspacePrefix, {ignoreInitial: true,
    awaitWriteFinish: true,
    depth: 10,
});
watcher.on('add', fileName => {
    // Handle new files
    queue.addUpdate(fileName, false);
});
watcher.on('addDir', dirName => {
    // Handle new directory
    queue.addUpdate(dirName, true);
});
watcher.on('change', fileName => {
    // Handle file changes
    queue.addUpdate(fileName, false);
});
watcher.on('unlink', fileName => {
    // Handle removed files
    queue.addDelete(fileName, false);
});
watcher.on('unlinkDir', dirName => {
    // Handle removed directory
    queue.addDelete(dirName, true);
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
        logger.info(`Query results: ${JSON.stringify(result.rows[0])}`);

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

async function _uploadToS3(filePath, isDirectory, S3FilePath, callback) {
    const s3 = new AWS.S3(awsConfig);

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
    const s3 = new AWS.S3(awsConfig);

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
        queue.addSkip(filePath, true, 'update');
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
        Bucket: workspaceBucketName,
        Key: S3FilePath,
    };
    console.log(workspaceBucketName);
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
        queue.addSkip(filePath, false, 'update');
        callback(null, 'OK');
    });
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
    var update_queue = queue.updateQueue;
    console.log(`watch update_queue: ${JSON.stringify(update_queue)}`);
    console.log(`watch skip: ${JSON.stringify(queue.skip_queue)}`);
    for (const key in update_queue) {
        const [path, isDirectory_str] = key.split(',');
        const isDirectory = isDirectory_str == 'true';
        const {workspace_id, localPath} = _getWorkspaceByPath(path);
        if (workspace_id == null) continue;
        logger.info(`watch: workspace_id=${workspace_id}, localPath=${localPath}`);
        const s3Name = id_workspace_mapper[workspace_id].s3Name;
        const syncIgnore = id_workspace_mapper[workspace_id].syncIgnore || [];
        logger.info(`watch: workspace_id=${workspace_id}, isDirectory_str=${isDirectory_str}`);
        logger.info(`watch: localPath=${localPath}`);
        logger.info(`watch: syncIgnore=${syncIgnore}`);
        
        let s3Path;
        if (!workspace_id) {
            logger.info(`watch return: workspace_id not mapped yet`);
            return;
        } else if (localPath === '') {
            logger.info(`watch continue: empty (root) path`);
            continue;
        } else if (syncIgnore.filter(ignored => localPath.startsWith(ignored)).length > 0) {
            logger.info(`watch continue: syncIgnored`);
            continue;
        } else {
            s3Path = `${s3Name}/${localPath}`;
            logger.info(`watch s3Path: ${s3Path}`);
        }

        if (update_queue[key].action == 'update') {
            jobs.push((callback) => {
                _uploadToS3(path, isDirectory, s3Path, callback);
            });
        } else if (update_queue[key].action == 'delete') {
            jobs.push((callback) => {
                _deleteFromS3(path, isDirectory, s3Path, callback);
            });
        }
    }
    queue.resetUpdateQueue();
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
    const s3 = new AWS.S3(awsConfig);

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
            sqldb.query(sql.update_load_count, {workspace_id, count: +1}, function(err, _result) {
                if (ERR(err, callback)) return;
                callback(null, container);
            });
        }
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

async function _delContainer(workspace_id, container) {
    async function skipAllFilesAndDirs(path){
        var files = await fsPromises.readdir(path);
            for (const file of files) {
                var subpath = path + '/' + file;
                var lstat = await fsPromises.lstat(subpath);
                if(lstat.isDirectory()){
                    queue.addSkip(subpath, true, 'delete');
                    await skipAllFilesAndDirs(subpath);
                } else {
                    queue.addSkip(subpath, false, 'delete');
                }
            }
        return new Promise((resolve) => {
            resolve();
        });
    }
    await skipAllFilesAndDirs(`${workspacePrefix}/${id_workspace_mapper[workspace_id].localName}`);

    // Require Node.js 12.10.0 or later otherwise it will complain that the folder isn't empty
    await fsPromises.rmdir(`${workspacePrefix}/${id_workspace_mapper[workspace_id].localName}`, { recursive: true });

    container.remove((err) => {
        if (err) {
            return err;
        }
        delete(port_id_mapper[id_workspace_mapper[workspace_id].port]);
        delete(id_workspace_mapper[workspace_id]);
        sqldb.query(sql.update_load_count, {workspace_id, count: -1}, function(err, _result) {
            if (err) {
                return err;
            }
            return(null, workspace_id, container);
        });
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
    id_workspace_mapper[workspace_id] = {};
    id_workspace_mapper[workspace_id].localName = `workspace-${uuidv4()}`;
    id_workspace_mapper[workspace_id].s3Name = `workspace-${workspace_id}`;
    logger.info(`id_workspace_mapper: ${JSON.stringify(id_workspace_mapper)}`);
    
    async.waterfall([
        (callback) => {_syncPullContainer(workspace_id, callback);},
        _getSettingsWrapper,
        _createContainerWrapper,
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
        (callback) => {_getContainer(workspace_id, callback);},
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
