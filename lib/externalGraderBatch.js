var ERR = require('async-stacktrace');
const async = require('async');
const EventEmitter = require('events');
const fs = require('fs-extra');
const targz = require('tar.gz');
const csrf = require('./csrf');
const AWS = require('aws-sdk');

const config = require('./config');
const externalGraderCommon = require('./externalGraderCommon');


class Grader {
    handleGradingRequest(grading_job, submission, variant, question, course) {
        const emitter = new EventEmitter();

        const dir = externalGraderCommon.getJobDirectory(grading_job.id);

        async.series([
            (callback) => {
                externalGraderCommon.buildDirectory(dir, submission, question, course, callback);
            },
            (callback) => {
                // Now that we've built up our directory, let's zip it up and send
                // it off to S3
                let tarball = new targz({}, {
                    fromBase: true,
                });

                let tarSrc = tarball.createReadStream(dir);

                const params = {
                    Bucket: config.externalGradingJobsS3Bucket,
                    Key: `job_${grading_job.id}.tar.gz`,
                };

                let s3Stream = require('s3-upload-stream')(new AWS.S3());
                let upload = s3Stream.upload(params);

                upload.on('error', (err) => {
                    ERR(err, callback);
                });

                upload.on('uploaded', () => {
                    callback(null);
                });

                tarSrc.pipe(upload);
            },
            (callback) => {
                createAndRegisterJobDefinition(grading_job.id, question, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            },
            (callback) => {
                submitGradingJobAWS(grading_job.id, question, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }
        ], (err) => {
            fs.remove(dir);
            if (err) {
                emitter.emit('error', err);
            } else {
                emitter.emit('submit');
            }
        });

        return emitter;
    }
}

function getJobDefinitionName(jobId) {
    return `ag-job-definition-${jobId}`;
}

function createAndRegisterJobDefinition(jobId, question, callback) {
    const params = {
        type: 'container',
        containerProperties: {
            image: question.external_grading_image,
            jobRoleArn: config.externalGradingJobRole,
            memory: 512,
            vcpus: 1,
        },
        jobDefinitionName: getJobDefinitionName(jobId),
    };

    const batch = new AWS.Batch();
    batch.registerJobDefinition(params, callback);
}

function submitGradingJobAWS(jobId, question, callback) {
    const params = {
        jobDefinition: getJobDefinitionName(jobId),
        jobName: `ag_job_${jobId}`,
        jobQueue: config.externalGradingJobQueue,
        containerOverrides: {
            environment: [
                {
                    name: 'JOB_ID',
                    value: jobId.toString(),
                },
                {
                    name: 'ENTRYPOINT',
                    value: question.external_grading_entrypoint,
                },
                {
                    name: 'S3_JOBS_BUCKET',
                    value: config.externalGradingJobsS3Bucket,
                },
                {
                    name: 'S3_RESULTS_BUCKET',
                    value: config.externalGradingResultsS3Bucket,
                },
                {
                    name: 'S3_ARCHIVES_BUCKET',
                    value: config.externalGradingArchivesS3Bucket,
                },
                {
                    name: 'WEBHOOK_URL',
                    value: config.externalGradingWebhookUrl,
                },
                {
                    name: 'CSRF_TOKEN',
                    value: csrf.generateToken({url: '/pl/webhooks/grading'}, config.secretKey),
                },
            ],
        },
    };

    const batch = new AWS.Batch();
    batch.submitJob(params, callback);
}

module.exports = Grader;
