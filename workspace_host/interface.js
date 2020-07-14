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

    async function _reinitializeS3(workspace_id, callback) {
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

    async function _syncPullContainer(workspace_id, callback) {
        if (fs.existsSync("./workspace-0")) {
            // we already had a local copy of the latest code, no need to sync
            callback(null, workspace_id);
            return;
        }
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

    async function _syncPushContainer(workspace_id, callback) {
        var cmd = "aws s3 sync ./workspace-0 s3://pl-workspace/workspace-0";
        
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

    async function _createContainer(workspace_id, callback) {
        // remove --rm for production 
        var cmd = 'docker create -it --name "workspace-0" -p 13746:8080 -v "$PWD/workspace-0:/home/coder/project" -u "$(id -u):$(id -g)" codercom/code-server:latest --auth none';

        var _ = exec(cmd, function (error, stdout, stderr) {
            if (stdout) {
                callback(null, workspace_id);
            } else if (stderr) {
                if (stderr.includes("is already in use")) {
                    callback(null, workspace_id);
                } else {
                    callback(stderr);
                }
            } else if (error) {
                callback(error);
            }
        });
    };

    async function _delContainer(workspace_id, callback) {
        // Do what you gotta do to shutdown the container
        var cmd = `docker rm workspace-${workspace_id}`;
        var _ = exec(cmd, function (error, stdout, stderr) {
            if (stdout) {          
                console.log(`Container for workspace ${workspace_id} deleted.`);
                callback(null, workspace_id);
            } else if (stderr) {
                callback(stderr);
            } else if (error) {
                callback(error);
            };
        });
    };

    async function _startContainer(workspace_id, callback) {
        // Do what you gotta do to start the container
        var cmd = `docker start workspace-${workspace_id} && sleep 2`;
        var _ = exec(cmd, function (error, stdout, stderr) {
            if (stdout) {          
                console.log(`Container for workspace ${workspace_id} is now running.`);
                callback(null, workspace_id);
            } else if (stderr) {
                callback(stderr);
            } else if (error) {
                callback(error);
            };
        });
    };

    async function _stopContainer(workspace_id, callback) {
        var cmd = `docker stop workspace-${workspace_id}`;
        var _ = exec(cmd, function (error, stdout, stderr) {
            if (stdout) {          
                console.log(`Container for workspace ${workspace_id} is now stopped.`);
                callback(null, workspace_id);
            } else if (stderr) {
                callback(stderr);
            } else if (error) {
                callback(error);
            };
        });
    };

    // Called by the main server the first time a workspace is used by a user
    function initSequence(workspace_id, res) {
        async.waterfall([
            (callback) => {_reinitializeS3(workspace_id, callback)},
            _syncPullContainer,
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

    // Called by the main server when the user comes back after leaving
    // Workspace host will NOT check if the S3 resources is allocated correctly, the main server need to do the checking
    function reloadSequence(workspace_id, res) {
        async.waterfall([
            (callback) => {_syncPullContainer(workspace_id, callback)},
            _createContainer,
            _startContainer,
        ], function(err) {
            if (err) {
                res.status(500).send(err);
            } else {
                res.status(200).send(`Container for workspace ${workspace_id} reloaded.`);
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

    // Called by the main server when the user lose connection with the websocket
    function stopSequence(workspace_id, res) {
        async.waterfall([
            (callback) => {_stopContainer(workspace_id, callback)},
            _syncPushContainer,
        ], function(err) {
            if (err) {
                res.status(500).send(err);
            } else {
                res.status(200).send(`Container for workspace ${workspace_id} stopped.`);
            };
        });
    };

    // Usage unclear, maybe should be called automatically by the workspace host?
    // Maybe should also remove the local copy of the code as well?
    function destroySequence(workspace_id, res) {
        async.waterfall([
            (callback) => {_delContainer(workspace_id, callback)},
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
    } else if (["init", "reload", "sync", "stop", "destroy"].includes(action)) {
        eval(action + "Sequence")(workspace_id, res);
    } else if (action == "status") {
        // check the status
        res.status(200).send("Running");
    } else {
        res.status(500).send(`Action "${action}" undefined`);
    };
});

app.listen(port, () => console.log("Listening on http://localhost:" + port));