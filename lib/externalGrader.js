const ERR = require('async-stacktrace');
const async = require('async');
const AWS = require('aws-sdk');
const fs = require('fs-extra');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const csrf = require('./csrf');
const config = require('./config');
const logger = require('./logger');
const externalGraderCommon = require('./externalGraderCommon');
const externalGradingSocket = require('./externalGradingSocket');
const fileStoreFactory = require('./externalGradingFileStoreFactory');
const queueFactory = require('./externalGradingQueueFactory');


const sql = sqlLoader.loadSqlEquiv(__filename);

let fileStore;
let queue;

module.exports.init = function(assessment, callback) {
    if (!config.externalGradingEnabled) {
        // Nothing to do here....
        logger.info('External grading disabled; set EXTERNAL_GRADING_ENABLED=true to enable');
        return callback(null);
    }

    module.exports.assessment = assessment;
    if (config.externalGradingQueueType === 'sqs' || config.externalGradingFileStoreType === 's3') {
        // So, this is terrible, but AWS will look relative to the Node working
        // directory, not the current directory. So aws-config.json should be
        // in the project root.
        if (fs.existsSync('./aws-config.json')) {
            logger.info('Loading AWS credentials for external grading');
            AWS.config.loadFromPath('./aws-config.json');
        } else {
            logger.info('Missing \'aws-config.json\' in project root; this should only matter for local development');
        }

        AWS.config.update({region: 'us-east-2'});
    }

    // We need a file store + queue of the configured type
    async.series([
        (callback) => {
            fileStoreFactory.create((err, createdFileStore) => {
                if (ERR(err, callback)) return;
                fileStore = createdFileStore;
                callback(null);
            });
        },
        (callback) => {
            queueFactory.create((err, createdQueue) => {
                if (ERR(err, callback)) return;
                queue = createdQueue;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
};

module.exports.beginGradingJob = function(grading_job_id, callback) {
    const params = {
        grading_job_id,
    };
    sqldb.queryOneRow(sql.select_grading_job_info, params, (err, result) => {
        if (ERR(err, callback)) return;
        const {
            grading_job,
            submission,
            variant,
            question,
            course,
        } = result.rows[0];

        module.exports._beginGradingJob(grading_job, submission, variant, question, course);
        callback(null);
    });
};

module.exports.beginGradingJobs = function(grading_job_ids, callback) {
    async.each(grading_job_ids, (grading_job_id, callback) => {
        module.exports.beginGradingJob(grading_job_id, (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
    }, (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
};

module.exports._beginGradingJob = function(grading_job, submission, variant, question, course) {
    if (!config.externalGradingEnabled || !question.external_grading_enabled) {
        logger.info('External grading disabled for job id: ' + grading_job.id);

        const message = config.externalGradingEnabled ?
            'External grading disabled; set EXTERNAL_GRADING_ENABLED=true to enable' :
            'External grading is disabled for this question; enable it in your questions\'s info.json';

        // Make the grade 0
        let ret = {
            gradingId: grading_job.id,
            grading: {
                score: 0,
                feedback: {
                    succeeded: true,
                    message,
                },
            },
        };

        // Send the grade out for processing and display
        module.exports.assessment.processGradingResult(ret);
        return;
    }

    logger.info(`Submitting external grading job ${grading_job.id}.`);

    async.series([
        (callback) => {
            fileStore.createFilesForJob(grading_job, submission, variant, question, course, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            const message = {
                jobId: grading_job.id,
                image: question.external_grading_image,
                entrypoint: question.external_grading_entrypoint,
                s3Bucket: externalGraderCommon.getS3RootKey(grading_job.id),
                webhookUrl: config.externalGradingWebhookUrl,
                csrfToken: csrf.generateToken({url: '/pl/webhooks/grading'}, config.secretKey),
                timeout: question.external_grading_timeout || config.externalGradingDefaultTimeout,
                enableNetworking: question.external_grading_enable_networking || false,
            };
            queue.submitJob(message, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            // Record the submission time in the DB
            const params = {
                grading_job_id: grading_job.id,
                grading_submitted_at: new Date().toISOString(),
            };
            sqldb.query(sql.update_grading_submitted_time, params, (err, _result) => {
                if (ERR(err, callback)) return;
                externalGradingSocket.gradingJobStatusUpdated(grading_job.id);
                callback(null);
            });
        },
    ], (err) => {
        if (err) {
            logger.error(`Error submitting grading job ${grading_job.id}`);
            logger.error(err);
            return;
        }
    });
};
