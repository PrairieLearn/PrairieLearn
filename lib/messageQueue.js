var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');

var config = require('./config');
var error = require('./error');
var logger = require('./logger');
var sqldb = require('./sqldb');
var sqlLoader = require('./sql-loader');

var AWS = require('aws-sdk');
var targz = require('tar.gz');
var sql = sqlLoader.loadSqlEquiv(__filename);
var fs = require('fs-extra');
var path = require('path');
var copydir = require('copy-dir');
var io = require('socket.io')();

var connected = false;

module.exports = {
};

module.exports.init = function(processGradingResult, callback) {
    if (config.autograderUseAws) {
        // So, this is terrible, but AWS will look relative to the Node working
        // directory, not the current directory. So aws-config.json should be
        // in the project root.
        if (fs.existsSync('./aws-config.json')) {
            logger.info('Loading AWS credentials for autograder')
            AWS.config.loadFromPath('./aws-config.json');
        } else {
            logger.info('Missing \'aws-config.json\' in project root; this should only matter for local development')
        }
        callback(null);
    } else {
        // local dev mode
        logger.info('Not loading AWS credentials; autograder running locally')
        module.exports.processGradingResult = processGradingResult;
        callback(null);
    }
};

module.exports.sendToGradingQueue = function(grading_log, submission, variant, question, course, callback) {
    if (config.autograderUseAws) {
        logger.info('submitting grading job id: ' + grading_log.id);

        callback(null);

        logger.info(JSON.stringify(submission.submitted_answer))

        if (question.autograding_enabled != true) {
          // Autograding not specified!
          logger.info('autograding disabled for job id: ' + grading_log.id);

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
            // We should submit our grading job to AWS
            // First, construct a local directory to hold the question files
            const dir = path.join('../autograder_jobs', `job_${grading_log.id}`);
            fs.mkdirsSync(dir);
            fs.mkdirSync(path.join(dir, 'shared'));
            fs.mkdirSync(path.join(dir, 'student'));

            let agName = question.autograder;
            let environmentName = question.environment;

            // Verify that an image was specified
            if (question.autograderImage === undefined) {
                logger.error('No image was specified for autograded question')
            }

            // Verify that an environment was specified
            if (environmentName === undefined) {
                // TODO find unique ID for question to print in the error message
                logger.error('No environment was specified for autograded question');
                return;
            }

            const environmentDir = path.join(course.path, 'environments', environmentName);
            if (!fs.existsSync(environmentDir)) {
                logger.error(`The specified environment "${environmentDir}" does not exist`);
                return;
            } else {
                copydir.sync(environmentDir, dir);
            }

            // Note: specifying an autograder is optional
            if (agName !== undefined) {
                const agDir = path.join(course.path, 'autograders', agName);
                if (!fs.existsSync(agDir)) {
                    logger.error(`Specified autograder "${agDir}" does not exist`);
                    return;
                } else {
                    copydir.sync(agDir, path.join(dir, 'shared'));
                }
            }

            // Tests might not be specified, only copy them if they exist
            const testsDir = path.join(course.path, 'questions', question.directory, 'tests');
            if (fs.existsSync(testsDir)) {
                copydir.sync(testsDir, path.join(dir, 'shared'));
            } else {
                // Maybe they meant to specify tests, let's warn just in case
                // TODO same as above, include unique question identifier
                logger.warn('No unit tests found for question; maybe you meant to specify some')
            }

            // Now that we've built up our directory, let's zip it up and send
            // it off to S3

            let s3 = new AWS.S3();

            let tarball = new targz({}, {
                fromBase: true,
            })

            let tarSrc = tarball.createReadStream(dir);

            const params = {
                Bucket: config.autograderJobsS3Bucket,
                Key: `job_${grading_log.id}.tar.gz`,
            }

            let s3Stream = require('s3-upload-stream')(new AWS.S3());
            let upload = s3Stream.upload(params);

            function cleanup() {
                fs.removeSync(dir)
            }

            upload.on('error', (err) => {
                logger.error(`Error uploading '${params.Key}' to S3`);
                logger.error(err);
                cleanup();
            })

            upload.on('uploaded', (details) => {
                logger.info(`Successfully uploaded '${params.Key}' to S3`);
                cleanup();
                createAndRegisterJobDefinition(grading_log.id, question, (err, data) => {
                    if (err) {
                        logger.error(`Failed to register job definition for job ${grading_log.id} with AWS Batch`)
                        logger.error(err)
                        return
                    }

                    logger.info(`Successfully registered job defition for job ${grading_log.id} with AWS Batch`)
                    logger.info(data)

                    submitGradingJobAWS(grading_log.id, question, (err, data) => {
                        if (err) {
                            logger.error(`Failed to submit grading job ${grading_log.id} to AWS Batch`)
                            logger.error(err)
                            return
                        }

                        logger.info(`Successfully submitted grading job ${grading_log.id} to AWS Batch`)
                        logger.info(data)
                    })
                })
            })

            tarSrc.pipe(upload);
        }
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

function getJobDefinitionName(jobId) {
    return `ag-job-definition-${jobId}`
}

function createAndRegisterJobDefinition(jobId, question, callback) {
    console.log(JSON.stringify(question))
    const params = {
        type: 'container',
        containerProperties: {
            image: question.autograder_image,
            jobRoleArn: config.autograderJobRole,
            memory: 512,
            vcpus: 1,
        },
        jobDefinitionName: getJobDefinitionName(jobId),
    }

    const batch = new AWS.Batch();
    batch.registerJobDefinition(params, callback)
}

function submitGradingJobAWS(jobId, question, callback) {
    const params = {
        jobDefinition: getJobDefinitionName(jobId),
        jobName: `ag_job_${jobId}`,
        jobQueue: config.autograderJobQueue,
        containerOverrides: {
            environment: [
                {
                    name: "JOB_ID",
                    value: jobId.toString(),
                },
                {
                    name: "S3_JOBS_BUCKET",
                    value: config.autograderJobsS3Bucket,
                },
                {
                    name: "S3_RESULTS_BUCKET",
                    value: config.autograderResultsS3Bucket,
                },
                {
                    name: "S3_ARCHIVES_BUCKET",
                    value: config.autograderArchivesS3Bucket,
                },
            ],
        },
    }

    const batch = new AWS.Batch();
    batch.submitJob(params, callback)
}

module.exports.cancelGrading = function(grading_id, callback) {
    // TODO: implement this
    callback(null);
};
