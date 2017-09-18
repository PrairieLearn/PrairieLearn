var ERR = require('async-stacktrace');
var async = require('async');
var fs = require('fs-extra');
var path = require('path');

var logger = require('./logger');

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
            fs.mkdir(path.join(dir, 'shared'), (err) => {
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
            // Copy all specified files/directories into shared/
            if (question.external_grading_files) {
                async.each(question.external_grading_files, (file, callback) => {
                    const src = path.join(course.path, 'serverFilesCourse', file);
                    const dest = path.join(dir, 'shared', file);
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
                    let decodedContents = new Buffer(file.contents, 'base64').toString();
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
        }
    ], (err) => {
        if (ERR(err, callback)) {
            return logger.error(`Error setting up ${dir}`);
        }

        logger.info(`Successfully set up ${dir}`);
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
module.exports.makeGradingResult = function(data) {
    if (typeof data === 'string' || Buffer.isBuffer(data)) {
        try {
            data = JSON.parse(data);
        } catch (e) {
            return {
                gradingId: data.job_id,
                grading: {
                    score: 0,
                    startTime: null,
                    endTime: null,
                    feedback: {
                        succeeded: false,
                    },
                },
            };
        }
    }

    if (!data.succeeded) {
        return {
            gradingId: data.job_id,
            grading: {
                startTime: data.start_time || null,
                endTime: data.end_time || null,
                score: 0,
                feedback: data
            }
        };
    }

    // TODO: once we have better error handling in place, account for these errors
    /*
    if (!data.results) {
        return callback(new Error('results.json did not contain \'results\' object.'));
    }

    if (typeof data.results.score !== 'number' || Number.isNaN(data.results.score)) {
        return callback(new Error('Score did not exist or is not a number!'));
    }
    */

    let score = 0.0;
    if (data.results && typeof data.results.score === 'number' && !Number.isNaN(data.results.score)) {
        score = data.results.score;
    }

    return {
        gradingId: data.job_id,
        grading: {
            startTime: data.start_time,
            endTime: data.end_time,
            score: score,
            feedback: data
        }
    };
};
