const express = require('express');
const app = express()
const port = 8081;
const { spawn, exec } = require("child_process");
const bodyParser = require('body-parser');
const osu = require('node-os-utils');
const cpu = osu.cpu;

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json())

app.get('/', function(req, res) {
    cpu.usage().then(v => {
        res.status(200).send({cpu_usage: v});
    });
});

app.post('/', function(req, res) {
    async function syncContainer(workspace_id, direction="push") {
        if (direction == "push") {
            var cmd = "aws s3 sync ./workspace-0 s3://arn:aws:s3:us-east-2:484505946769:accesspoint/access-point-bb/workspace-0";
        } else if (direction == "pull") {
            var cmd = "aws s3 sync s3://arn:aws:s3:us-east-2:484505946769:accesspoint/access-point-bb/question-0 ./workspace-0 && echo success";
        } else {
            console.log("Unknown command");
            return false;
        }
        var obj = exec(cmd, function (error, stdout, stderr) {
            if (stdout) { 
                console.log("Sync successfully");         
                return true;
            } else if (stderr) {
                console.log(stderr);
                return false;
            } else if (error) {
                console.log(error);
                return false;
            };
        });
    };

    async function initContainer(workspace_id) {
        // Do what you gotta do to create the container

        // remove --rm for production 
        var ret = await syncContainer(workspace_id, "pull");
        if (ret == false) {
            console.log("Fail to load the origin question from S3");
            res.status(500).send("Fail to load the origin question from S3");
            return;
        }
        var cmd = 'docker create -it --name "workspace-0" -p 13746:8080 -v "$PWD/workspace-0:/home/coder/project" -u "$(id -u):$(id -g)" codercom/code-server:latest --auth none';
        var obj = exec(cmd, function (error, stdout, stderr) {
            if (stdout) {
                startContainer(workspace_id);
            } else if (stderr) {
                if (stderr.includes("is already in use")) {
                    startContainer(workspace_id);
                } else {
                    res.status(500).send(stderr);
                }
            } else if (error) {
                res.status(500).send(error);
            }
        });
    };

    async function delContainer(workspace_id) {
        // Do what you gotta do to shutdown the container
        var cmd = `docker rm workspace-${workspace_id}`;
        var obj = exec(cmd, function (error, stdout, stderr) {
            if (stdout) {          
                res.status(200).send(`Container for workspace ${workspace_id} deleted.`);
            } else if (stderr) {
                res.status(500).send(stderr);
            } else if (error) {
                res.status(500).send(error);
            };
        });
    };

    async function startContainer(workspace_id) {
        // Do what you gotta do to start the container
        var cmd = `docker start workspace-${workspace_id} && sleep 2`;
        var obj = exec(cmd, function (error, stdout, stderr) {
            if (stdout) {          
                res.status(200).send(`Container for workspace ${workspace_id} is now running.`);
            } else if (stderr) {
                res.status(500).send(stderr);
            } else if (error) {
                res.status(500).send(error);
            };
        });
    };

    async function stopContainer(workspace_id) {
        // Do what you gotta do to stop the container


        var ret = await syncContainer(workspace_id, "push");
        if (ret == false) {
            console.log("Fail to push the code to S3");
            res.status(500).send("Fail to push the code to S3");
            return;
        }
        var cmd = `docker stop workspace-${workspace_id}`;

        var obj = exec(cmd, function (error, stdout, stderr) {
            if (stdout) {          
                res.status(200).send(`Container for workspace ${workspace_id} is now stopped.`);
            } else if (stderr) {
                res.status(500).send(stderr);
            } else if (error) {
                res.status(500).send(error);
            };
        });
    };

    var workspace_id = req.body.workspace_id;
    var action = req.body.action;
    if (workspace_id == undefined) {
        res.status(500).send("Missing workspace_id");
    } else if (action == undefined) {
        res.status(500).send("Missing action");
    } else if (["init", "del", "start", "stop", "sync"].includes(action)) {
        eval(action + "Container")(workspace_id);
    } else if (action == "status") {
        // check the status
        res.status(200).send("Running");
    } else {
        res.status(500).send(`Action "${action}" undefined`);
    };
});

app.listen(port, () => console.log("Listening on http://localhost:" + port));