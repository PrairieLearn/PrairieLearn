const express = require('express');
const app = express()
const port = 8081;
const { spawn, exec } = require("child_process");   // use dockerode and aws-sdk instead
const Docker = require('dockerode');
const fs = require("fs");
const async = require('async');

const bodyParser = require('body-parser');
const osu = require('node-os-utils');
const cpu = osu.cpu;
const docker = new Docker();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json())

app.get('/', function(req, res) {
    cpu.usage().then(v => {
        // let them know that the workspace host is online
        // also send something useful back
        res.status(200).send({cpu_usage: v});
    });
});

app.post('/', function(req, res) {

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

    function _syncPullContainer(workspace_id, callback) {
        var cmd = "aws s3 sync s3://pl-workspace/workspace-0 ./workspace-0 && echo success";
        
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

    function _syncPushContainer(workspace_id, callback) {
        if (!fs.existsSync("./workspace-0")) {
            // we didn't a local copy of the code, DONOT sync
            callback(null, workspace_id);
            return;
        }
        var cmd = "aws s3 sync ./workspace-0 s3://pl-workspace/workspace-0 && echo success";
        
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
                Binds: ['/Users/yipenghan/Documents/PrairieLearn_SU20/workspaceServer/workspace-0:/home/coder/project'],
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
                callback(err);
            } else {
                callback(null, container);
            };
        });
    };

    function _delContainer(container, callback) {
        container.remove((err) => {
            if (err) {
                callback(err);
            } else {
                callback(null, container);
            };
        });
        // TODO: recursive remove all the local copy of the code
    };

    function _startContainer(container, callback) {
        container.start((err) => {
            if (err) {callback(err); return;};
            callback(null, container);
        })
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
            (callback) => {_resetS3(workspace_id, callback)},
            _syncPullContainer,
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