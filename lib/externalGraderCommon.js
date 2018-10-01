const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');
const fs = require('fs-extra');
const path = require('path');

const logger = require('./logger');

/**
 * Returns the directory where job files should be written to while running
 * with AWS infrastructure.
 */
module.exports.getJobDirectory = function(jobId) {
    return `/jobs/job_${jobId}`;
};

/**
 * Constructs a directory of files to be used for grading.
 */
module.exports.buildDirectory = function(dir, submission, variant, question, course, callback) {
    async.series([
        (callback) => {
            // Attempt to remove existing directory first
            fs.remove(dir, () => {
                // Ignore error for now
                callback(null);
            });
        },
        (callback) => {
            fs.mkdirs(dir, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            fs.mkdir(path.join(dir, 'serverFilesCourse'), (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            fs.mkdir(path.join(dir, 'tests'), (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            fs.mkdir(path.join(dir, 'student'), (err) => {
              if (ERR(err, callback)) return;
              callback(null);
            });
        },
        (callback) => {
          fs.mkdir(path.join(dir, 'data'), (err) => {
            if (ERR(err, callback)) return;
            callback(null);
        });
        },
        (callback) => {
            // Copy all specified files/directories into serverFilesCourse/
            if (question.external_grading_files) {
                async.each(question.external_grading_files, (file, callback) => {
                    const src = path.join(course.path, 'serverFilesCourse', file);
                    const dest = path.join(dir, 'serverFilesCourse', file);
                    fs.copy(src, dest, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                }, (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            } else {
                callback(null);
            }
        },
        (callback) => {
            // This is temporary while /grade/shared is deprecated but still supported
            // TODO remove this when we remove support for /grade/shared
            const src = path.join(dir, 'serverFilesCourse');
            const dest = path.join(dir, 'shared');
            fs.copy(src, dest, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            // Tests might not be specified, only copy them if they exist
            const testsDir = path.join(course.path, 'questions', question.directory, 'tests');
            fs.access(testsDir, fs.constants.R_OK, (err) => {
                if (!err) {
                    fs.copy(testsDir, path.join(dir, 'tests'), (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                } else {
                    logger.warn(`No tests directory found for ${question.qid}; maybe you meant to specify some?`);
                    callback(null);
                }
            });
        },
        (callback) => {
            if (submission.submitted_answer._files) {
                async.each(submission.submitted_answer._files, (file, callback) => {
                    if (!file.name) {
                        return callback(new Error('File was missing \'name\' property.'));
                    }
                    if (!file.contents) {
                        return callback(new Error('File was missing \'contents\' property.'));
                    }

                    // Files are expected to be base-64 encoded
                    let decodedContents = Buffer.from(file.contents, 'base64').toString();
                    fs.writeFile(path.join(dir, 'student', file.name), decodedContents, callback);
                }, function(err) {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            } else {
                callback(null);
            }
        },
        (callback) => {
            // This uses the same fields passed v3's server.grade functions
            const data = {
                params: variant.params,
                correct_answers: variant.true_answer,
                submitted_answers: submission.submitted_answer,
                format_errors: submission.format_errors,
                partial_scores: (submission.partial_scores == null) ? {} : submission.partial_scores,
                score: (submission.score == null) ? 0 : submission.score,
                feedback: (submission.feedback == null) ? {} : submission.feedback,
                variant_seed: parseInt(variant.variant_seed, 36),
                options: variant.options || {},
                raw_submitted_answers: submission.raw_submitted_answer,
                gradable: submission.gradable,
            };
            fs.writeJSON(path.join(dir, 'data', 'data.json'), data, callback);
        },
    ], (err) => {
        if (ERR(err, callback)) {
            return logger.error(`Error setting up ${dir}`);
        }

        logger.verbose(`Successfully set up ${dir}`);
        callback(null);
    });
};

/**
* Generates an object that can be passed to assessment.processGradingResult.
* This function can be passed a parsed results object, or it can be passed a
* string or buffer to attempt to parse it and mark the grading job as failed when
* parsing fails.
*
* @param {Object|string|Buffer} data - The grading results
*/
module.exports.makeGradingResult = function(jobId, rawData) {
    let data = rawData;

    // Convert objects or buffers to strings so that we can remove null bytes,
    // which Postgres doesn't like
    if (Buffer.isBuffer(rawData)) {
        data = rawData.toString('utf-8');
    } else if (_.isObject(rawData)) {
        data = JSON.stringify(rawData);
    }

    try {
        data = JSON.parse(data.replace(/\0/g, ''));
    } catch (e) {
        return makeGradingFailureWithMessage(jobId, data, 'Could not parse the grading results.');
    }

    if (!data.succeeded) {
        return {
            gradingId: jobId,
            grading: {
                receivedTime: data.received_time || null,
                startTime: data.start_time || null,
                endTime: data.end_time || null,
                score: 0,
                feedback: data,
            },
        };
    }

    if (!data.results) {
        return makeGradingFailureWithMessage(jobId, data, 'results.json did not contain \'results\' object.');
    }

    let score = 0.0;
    if (typeof data.results.score === 'number' || !Number.isNaN(data.results.score)) {
        score = data.results.score;
    } else {
        return makeGradingFailureWithMessage(jobId, data, `score "${data.results.score}" was not a number.`);
    }

    return {
        gradingId: jobId,
        grading: {
            receivedTime: data.received_time || null,
            startTime: data.start_time || null,
            endTime: data.end_time || null,
            score,
            feedback: data,
        },
    };
};

function makeGradingFailureWithMessage(jobId, data, message) {
    return {
        gradingId: jobId,
        grading: {
            receivedTime: (data && data.received_time) || null,
            startTime: (data && data.start_time) || null,
            endTime: (data && data.end_time) || null,
            score: 0,
            feedback: {
                succeeded: false,
                message,
            },
        },
    };
}
