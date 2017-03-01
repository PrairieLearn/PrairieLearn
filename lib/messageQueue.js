var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var config = require('./config');
var error = require('./error');
var logger = require('./logger');
var sqldb = require('./sqldb');
var sqlLoader = require('./sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);
var fs = require('fs');
var path = require('path');
var copydir = require('copy-dir');
var io = require('socket.io')();

var connected = false;

module.exports = {
};

module.exports.init = function(config, processGradingResult, callback) {
    if (config.sqsConfig) {
        // set up SQS
        callback(null);
    } else {
        // local dev mode
        module.exports.processGradingResult = processGradingResult;
        callback(null);
    }
};

module.exports.sendToGradingQueue = function(grading_log, submission, variant, question, course, callback) {
    // Helper function
    let deleteFolderRecursive = function (path) {
        if (fs.existsSync(path)) {
            fs.readdirSync(path).forEach(function (file, index) {
                let curPath = path + "/" + file;
                if (fs.lstatSync(curPath).isDirectory()) { // recurse
                    deleteFolderRecursive(curPath);
                } else { // delete file
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path);
        }
    };

    if (config.sqsConfig) {
        // TODO push data to S3 and SQS
        callback(null);
    } else {
        // local dev mode
        console.log('submitting grading job id: ' + grading_log.id);
        callback(null);

        // Check if autograding is enabled
        console.log(JSON.stringify(question));

        if (question.autograding_enabled != true) {
            // Autograding not specified!
            console.log('autograding disabled for job id: ' + grading_log.id);

            // Make the grade a automatic 100
            let ret = {
                gradingId: grading_log.id,
                grading: {
                    score: 1,
                    feedback: {msg: "Autograder is not enabled :("},
                },
            };

            // Send the grade out for processing and display
            module.exports.processGradingResult(ret);
        } else {
            // Autograding is enabled
            // Get the autograder name and the DockerFile environment
            let agName = question.autograder;
            let environmentName = question.environment;

            // Create the directory for the job. If it already exists, delete and remake it
            let dir = path.join('/jobs', `job${grading_log.id}`);
            if (fs.existsSync(dir)) {
                deleteFolderRecursive(dir);
            }
            fs.mkdirSync(dir);
            fs.mkdirSync(path.join(dir, 'shared'));
            fs.mkdirSync(path.join(dir, 'student'));

            // Copy the autograder first
            copydir.sync(course.path + '/autograders/' + agName + '/', dir + '/shared');

            // Copy the DockerFile and .dockerignore
            copydir.sync(course.path + '/environments/' + environmentName + '/', dir);

            // Copy the tests folder
            copydir.sync(course.path + '/questions/' + question.directory + '/tests/', dir + '/shared');

            // Create the student file
            // TODO change the name based on the question
            fs.writeFile(dir + '/student/fib.py', submission.submitted_answer.code, function(err) {
                if(err) {
                    return console.log(err);
                }

                console.log("The student file was saved!");
            });

            // Make the json
            let gradingJob = {};
            gradingJob['jobId'] = grading_log.id;
            gradingJob['directory'] = dir;
            gradingJob['courseName'] = course.short_name;

            console.log(gradingJob);

            // Forward the json to master-grader
            io.on('connection', function(client){
                console.log('connected!');
                client.emit('new-job', gradingJob);

                // Listen for a grading result from the master-grader
                client.on('result', function(data) {
                    let parsed = JSON.parse(data)

                    // Process the data
                    let ret = {
                        //gradingId: data.jobId,
                        gradingId: gradingJob['jobId'],
                        grading: {
                            score: parsed.score,
                            feedback: {msg: parsed.output}
                        }
                    };

                    // Report to student
                    console.log('grading object: ' + ret);
                    module.exports.processGradingResult(ret);
                })
            });

            // Establish a connection with the master-grader
            if (!connected) {
              io.listen(3007);
              connected = true
            }
        }
    }
};

module.exports.cancelGrading = function(grading_id, callback) {
    // TODO: implement this
    callback(null);
};
