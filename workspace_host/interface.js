const express = require('express');
const app = express()
const port = 8081;
const { spawn, exec } = require("child_process");   // use dockerode and aws-sdk instead
const path = require("path");
const AWS = require('aws-sdk');
const Docker = require('dockerode');
const fs = require("fs");
const async = require('async');
const logger = require('../lib/logger');

const aws = require('../lib/aws.js');
aws.init((err) => {
    if (err) logger.debug(err);
});

const config = require('../lib/config.js');
config.loadConfig("config.json");

const workspaceBucketName = config.workspaceS3Bucket;
if (workspaceBucketName == '') {
    logger.warn("Workspace bucket is not configed correctly. Check config.json.");
} else {
    logger.info("Workspace bucket is configed to: " + workspaceBucketName);
}

const bodyParser = require('body-parser');
const docker = new Docker();



app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json())

app.post('/', function(req, res) {
    var workspace_id = req.body.workspace_id;
    var action = req.body.action;
    if (workspace_id == undefined) {
        res.status(500).send("Missing workspace_id");
    } else if (action == undefined) {
        res.status(500).send("Missing action");
    } else if (["init", "sync", "reset", "destroy"].includes(action)) {
        eval(action + "Sequence")(workspace_id, res);
    } else if (action == "status") {
        res.status(200).send("Running");
    } else {
        res.status(500).send(`Action "${action}" undefined`);
    };
});

app.listen(port, () => console.log("Listening on http://localhost:" + port));

// DEPRECATED
function _resetS3(workspace_id, callback) {
    var cmd = "aws s3 cp s3://pl-workspace/question-0 s3://pl-workspace/workspace-0 --recursive";

    var _ = exec(cmd, function (error, stdout, stderr) {
        if (stdout) {   
            callback(null, workspace_id);
        } else if (stderr) {
            callback(stderr);
        } else if (error) {
            callback(error);
        };
    });
};

function _uploadToS3(filePath, S3FilePath, callback) {
    s3 = new AWS.S3();
    var uploadParams = {
        Bucket: workspaceBucketName,
        Key: S3FilePath,
        Body: fs.readFileSync(filePath),
    };
    s3.upload(uploadParams, function(err, data) {
        if (err) {
            callback(null, [filePath, S3FilePath, err]);
            return;
        };
        callback(null, "OK");
    });
};

function _downloadFromS3(filePath, S3FilePath, callback) {
    if (!fs.existsSync(path.dirname(filePath))){
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
    };
    s3 = new AWS.S3();
    var downloadParams = {
        Bucket: workspaceBucketName,
        Key: S3FilePath
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
        callback(null, "OK");
    });
};

function _recursiveUploadJobManager(curDirPath, S3curDirPath) {
    var ret = [];
    fs.readdirSync(curDirPath).forEach(function (name) {
        var filePath = path.join(curDirPath, name);
        var S3filePath = path.join(S3curDirPath, name);
        var stat = fs.statSync(filePath);
        if (stat.isFile()) {
            ret.push([filePath, S3filePath]);
        } else if (stat.isDirectory()) {
            ret = ret.concat(_recursiveUploadJobManager(filePath, S3filePath));
        };
    });
    return ret;
};

function _recursiveDownloadJobManager(curDirPath, S3curDirPath, callback) {
    s3 = new AWS.S3();
    var listingParams = {
        Bucket: workspaceBucketName,
        Prefix: S3curDirPath
    };
    
    s3.listObjectsV2(listingParams, (err, data) => {
        if (err) {
            callback(err);
            return;
        };
        var contents = data["Contents"];
        var ret = [];
        contents.forEach(dict => {
          if ("Key" in dict) {
              var filePath = path.join(curDirPath, dict["Key"].slice(S3curDirPath.length));
              var S3filePath = dict["Key"];
              ret.push([filePath, S3filePath]);
          };
      });
      callback(null, ret);
    });
};

function _syncPullContainer(workspace_id, callback) {
    _recursiveDownloadJobManager("workspace-0", "workspace-0", (err, jobs_params) => {
        if (err) {
            callback(err);
            return;
        };
        var jobs = [];
        jobs_params.forEach(([filePath, S3filePath]) => {
            jobs.push( ((mockCallback) => {
                _downloadFromS3(filePath, S3filePath, mockCallback);
            }));
        });

        var status = []; 
        async.parallel(jobs, function(_, results) {
            results.forEach((res) => {
                if (res != "OK") {
                    res[2].fileLocalPath = res[0];
                    res[2].fileS3Path = res[0];
                    status.push(res[2]);
                };
            });
            if (status.length != 0) {
                callback(status);
            } else {
                callback(null, workspace_id);
            }
        });
    });
};

async function _syncPushContainer(workspace_id, callback) {
    if (!fs.existsSync("./workspace-0")) {
        // we didn't a local copy of the code, DO NOT sync
        callback(null, workspace_id);
        return;
    }
    var jobs_params = _recursiveUploadJobManager("workspace-0", "workspace-0");
    var jobs = [];
    jobs_params.forEach(([filePath, S3filePath]) => {
        jobs.push( ((mockCallback) => {
            _uploadToS3(filePath, S3filePath, mockCallback);
        }));
    });

    var status = []; 
    async.parallel(jobs, function(_, results) {
        results.forEach((res) => {
            if (res != "OK") {
                res[2].fileLocalPath = res[0];
                res[2].fileS3Path = res[0];
                status.push(res[2]);
            };
        });
        if (status.length != 0) {
            callback(status);
        } else {
            callback(null, workspace_id);
        };
    });
};

function _getContainer(workspace_id, callback) {
    var container = docker.getContainer("workspace-0");
    callback(null, container);
};

function _createContainer(workspace_id, callback) {
    docker.createContainer({
        Image: 'codercom/code-server',
        ExposedPorts: {
            "8080/tcp": {},
        },
        HostConfig: {
            PortBindings: {'8080/tcp': [{"HostPort": '13746'}]},
            Binds: [path.join(process.cwd(), '/workspace-0') + ':/home/coder/project'],
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
        Cmd: ['--auth', 'none'],
        name: 'workspace-0',
        Volumes: {
            '/home/coder/project': {}
          },
    }, (err, container) => {
        if (err) {
            if (err.toString().includes("is already in use")) {
                _getContainer(workspace_id, callback);
            } else {
                callback(err);
            };
        } else {
            callback(null, container);
        };
    });
};

function _delContainer(container, callback) {
    // Require Node.js 12.10.0 or later otherwise it will complain that the folder isn't empty
    fs.rmdirSync("./workspace-0", { recursive: true });
    container.remove((err) => {
        if (err) {
            callback(err);
        } else {
            callback(null, container);
        };
    });
};

function _startContainer(container, callback) {
    container.start((err) => {
        if (err) {
            if (err.toString().includes("already started")) {
                callback(null, container);
            } else {
                callback(err);
            };
        } else {
            callback(null, container);
        };
    });
};

function _stopContainer(container, callback) {
    container.stop((err) => {
        if (err) {
            callback(err);
        } else {
            callback(null, container);
        };
    });
};

// Called by the main server the first time a workspace is used by a user
function initSequence(workspace_id, res) {
    async.waterfall([
        (callback) => {_syncPullContainer(workspace_id, callback)},
        _createContainer,
        _startContainer,
    ], function(err) {
        if (err) {
            res.status(500).send(err);
        } else {
            res.status(200).send(`Container for workspace ${workspace_id} initialized.`);
        };
    });
};

// Called by the main server when the user need to save the file to S3
// Will be trigger by the user's heartbeats and when user has lost connection with the websocket
function syncSequence(workspace_id, res) {
    async.waterfall([
        (callback) => {_syncPushContainer(workspace_id, callback)},
    ], function(err) {
        if (err) {
            res.status(500).send(err);
        } else {
            res.status(200).send(`Code of workspace ${workspace_id} pushed.`);
        };
    });
};

// Called by the main server when the user want to reset the file to default
function resetSequence(workspace_id, res) {
    async.waterfall([
        (callback) => {_syncPullContainer(workspace_id, callback)},
    ], function(err) {
        if (err) {
            res.status(500).send(err);
        } else {
            res.status(200).send(`Code of workspace ${workspace_id} reset.`);
        };
    });
};

// Usage unclear, maybe should be called automatically by the workspace host?
// Maybe should also remove the local copy of the code as well?
function destroySequence(workspace_id, res) {
    async.waterfall([
        (callback) => {_syncPushContainer(workspace_id, callback)},
        _getContainer,
        _stopContainer,
        _delContainer
    ], function(err) {
        if (err) {
            res.status(500).send(err);
        } else {
            res.status(200).send(`Container for workspace ${workspace_id} destroyed.`);
        };
    });
};
