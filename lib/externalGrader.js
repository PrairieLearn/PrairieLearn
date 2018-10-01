const ERR = require('async-stacktrace');
const async = require('async');
const AWS = require('aws-sdk');
const fs = require('fs-extra');

const config = require('./config');
const logger = require('./logger');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const externalGradingSocket = require('./externalGradingSocket');
const ExternalGraderSqs = require('./externalGraderSqs');
const ExternalGraderLocal = require('./externalGraderLocal');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports.init = function(assessment, callback) {
    module.exports.assessment = assessment;
    if (config.externalGradingUseAws) {
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
        module.exports.grader = new ExternalGraderSqs();

        callback(null);
    } else {
        // local dev mode
        logger.info('Not loading AWS credentials; external grader running locally');
        module.exports.grader = new ExternalGraderLocal();
        callback(null);
    }
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
    if (!question.external_grading_enabled) {
        logger.verbose('External grading disabled for job id: ' + grading_job.id);

        // Make the grade 0
        let ret = {
            gradingId: grading_job.id,
            grading: {
                score: 0,
                feedback: {
                    succeeded: true,
                    message: 'External grading is not enabled :(',
                },
            },
        };

        // Send the grade out for processing and display
        module.exports.assessment.processGradingResult(ret);
        return;
    }

    logger.verbose(`Submitting external grading job ${grading_job.id}.`);

    const gradeRequest = module.exports.grader.handleGradingRequest(grading_job, submission, variant, question, course);
    gradeRequest.on('submit', () => {
        updateJobSubmissionTime(grading_job.id, (err) => {
            if (ERR(err, (err) => logger.error(err))) return;
        });
    });
    gradeRequest.on('received', (receivedTime) => {
        // This event is only fired when running locally; this production, this
        // is handled with the webhook.
        updateJobReceivedTime(grading_job.id, receivedTime, (err) => {
            if (ERR(err, (err) => logger.errror(err))) return;
        });
    });
    gradeRequest.on('results', (gradingResult) => {
        // This event will only be fired when running locally; in production,
        // external grader results wil be delivered via webhook.
        module.exports.assessment.processGradingResult(gradingResult);
        logger.verbose(`Successfully processed grading job ${grading_job.id}`);
    });
    gradeRequest.on('error', (err) => {
        handleGraderError(grading_job.id, err);
    });
};

function handleGraderError(jobId, err) {
    logger.error(`Error processing external grading job ${jobId}`);
    logger.error(err);
    const gradingResult = {
        gradingId: jobId,
        grading: {
            score: 0,
            startTime: null,
            endTime: null,
            feedback: {
                succeeded: false,
                message: err.toString(),
            },
        },
    };
    module.exports.assessment.processGradingResult(gradingResult);
}

function updateJobSubmissionTime(grading_job_id, callback) {
    var params = {
        grading_job_id: grading_job_id,
        grading_submitted_at: new Date().toISOString(),
    };
    sqldb.query(sql.update_grading_submitted_time, params, (err, _result) => {
        if (ERR(err, callback)) return;
        externalGradingSocket.gradingJobStatusUpdated(grading_job_id);
        callback(null);
    });
}

function updateJobReceivedTime(grading_job_id, receivedTime, callback) {
    var params = {
        grading_job_id: grading_job_id,
        grading_received_at: receivedTime,
    };
    sqldb.query(sql.update_grading_received_time, params, (err, _result) => {
        if (ERR(err, callback)) return;
        externalGradingSocket.gradingJobStatusUpdated(grading_job_id);
        callback(null);
    });
}
