const ERR = require('async-stacktrace');
const util = require('util');
const _ = require('lodash');
const path = require('path');
const streamifier = require('streamifier');
const csvtojson = require('csvtojson');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const logger = require('../lib/logger');
const serverJobs = require('../lib/server-jobs');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

module.exports = {

    /**
     * Update question instance scores from a CSV file.
     *
     * @param {number} assessment_id - The assessment to update.
     * @param {csvFile} csvFile - An object with keys {originalname, size, buffer}.
     * @param {number} user_id - The current user performing the update.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {function} callback - A callback(err, job_sequence_id) function.
     */
    uploadInstanceQuestionScores(assessment_id, csvFile, user_id, authn_user_id, callback) {
        debug('uploadInstanceQuestionScores()');
        if (csvFile == null) {
            return callback(new Error('No CSV file uploaded'));
        }
        const params = {assessment_id};
        sqldb.queryOneRow(sql.select_assessment_info, params, function(err, result) {
            if (ERR(err, callback)) return;
            const assessment_label = result.rows[0].assessment_label;
            const course_instance_id = result.rows[0].course_instance_id;
            const course_id = result.rows[0].course_id;
            
            const options = {
                course_id: course_id,
                course_instance_id: course_instance_id,
                assessment_id: assessment_id,
                user_id: user_id,
                authn_user_id: authn_user_id,
                type: 'upload_instance_question_scores',
                description: 'Upload question scores for ' + assessment_label,
            };
            serverJobs.createJobSequence(options, function(err, job_sequence_id) {
                if (ERR(err, callback)) return;
                callback(null, job_sequence_id);

                // We've now triggered the callback to our caller, but we
                // continue executing below to launch the jobs themselves.

                const jobOptions = {
                    course_id: course_id,
                    course_instance_id: course_instance_id,
                    assessment_id: assessment_id,
                    user_id: user_id,
                    authn_user_id: authn_user_id,
                    type: 'upload_instance_question_scores',
                    description: 'Upload question scores for ' + assessment_label,
                    job_sequence_id: job_sequence_id,
                    last_in_sequence: true,
                };
                serverJobs.createJob(jobOptions, function(err, job) {
                    if (err) {
                        logger.error('Error in createJob()', err);
                        serverJobs.failJobSequence(job_sequence_id);
                        return;
                    }
                    job.verbose('Uploading question scores for ' + assessment_label);

                    // acculumate output lines in the "output" variable and actually
                    // output put them in blocks, to avoid spamming the updates
                    let output = null;
                    let outputCount = 0;
                    let outputThreshold = 100;

                    job.verbose(`Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`);
                    job.verbose(`----------------------------------------`);
                    const csvStream = streamifier.createReadStream(csvFile.buffer, {encoding: 'utf8'});
                    const csvConverter = csvtojson({
                        colParser:{
                            instance: 'number',
                            score_perc: 'number',
                            points: 'number',
                            submission_id: 'number',
                        },
                        maxRowLength: 10000,
                    });
                    let successCount = 0, errorCount = 0;
                    csvConverter
                        .fromStream(csvStream)
                        .subscribe((json, number) => {
                            return new Promise((resolve, _reject) => {
                                const msg = `Processing CSV record ${number}: ${JSON.stringify(json)}`;
                                if (output == null) {
                                    output = msg;
                                } else {
                                    output += '\n' + msg;
                                }
                                module.exports._updateInstanceQuestionFromJson(json, assessment_id, authn_user_id, (err) => {
                                    if (err) {
                                        errorCount++;
                                        const msg = String(err);
                                        if (output == null) {
                                            output = msg;
                                        } else {
                                            output += '\n' + msg;
                                        }
                                    } else {
                                        successCount++;
                                    }
                                    outputCount++;
                                    if (outputCount >= outputThreshold) {
                                        job.verbose(output);
                                        output = null;
                                        outputCount = 0;
                                        outputThreshold *= 2; // exponential backoff
                                    }
                                    resolve();
                                });
                            });
                        })
                        .then(() => {
                            if (output != null) {
                                job.verbose(output);
                            }
                            job.verbose(`----------------------------------------`);
                            if (errorCount == 0) {
                                job.verbose(`Successfully updated scores for ${successCount} questions, with no errors`);
                                job.succeed();
                            } else {
                                job.verbose(`Successfully updated scores for ${successCount} questions`);
                                job.fail(`Error updating ${errorCount} questions`);
                            }
                        })
                        .catch((err) => {
                            if (output != null) {
                                job.verbose(output);
                            }
                            job.fail('Error processing CSV', err);
                        });
                });
            });
        });
    },

    /**
     * Update assessment instance scores from a CSV file.
     *
     * @param {number} assessment_id - The assessment to update.
     * @param {csvFile} csvFile - An object with keys {originalname, size, buffer}.
     * @param {number} user_id - The current user performing the update.
     * @param {number} authn_user_id - The current authenticated user.
     * @param {function} callback - A callback(err, job_sequence_id) function.
     */
    uploadAssessmentInstanceScores(assessment_id, csvFile, user_id, authn_user_id, callback) {
        debug('uploadAssessmentInstanceScores()');
        if (csvFile == null) {
            return callback(new Error('No CSV file uploaded'));
        }
        const params = {assessment_id};
        sqldb.queryOneRow(sql.select_assessment_info, params, function(err, result) {
            if (ERR(err, callback)) return;
            const assessment_label = result.rows[0].assessment_label;
            const course_instance_id = result.rows[0].course_instance_id;
            const course_id = result.rows[0].course_id;

            const options = {
                course_id: course_id,
                course_instance_id: course_instance_id,
                assessment_id: assessment_id,
                user_id: user_id,
                authn_user_id: authn_user_id,
                type: 'upload_assessment_instance_scores',
                description: 'Upload total scores for ' + assessment_label,
            };
            serverJobs.createJobSequence(options, function(err, job_sequence_id) {
                if (ERR(err, callback)) return;
                callback(null, job_sequence_id);

                // We've now triggered the callback to our caller, but we
                // continue executing below to launch the jobs themselves.

                const jobOptions = {
                    course_id: course_id,
                    course_instance_id: course_instance_id,
                    assessment_id: assessment_id,
                    user_id: user_id,
                    authn_user_id: authn_user_id,
                    type: 'upload_assessment_instance_scores',
                    description: 'Upload total scores for ' + assessment_label,
                    job_sequence_id: job_sequence_id,
                    last_in_sequence: true,
                };
                serverJobs.createJob(jobOptions, function(err, job) {
                    if (err) {
                        logger.error('Error in createJob()', err);
                        serverJobs.failJobSequence(job_sequence_id);
                        return;
                    }
                    job.verbose('Uploading total scores for ' + assessment_label);

                    // acculumate output lines in the "output" variable and actually
                    // output put them in blocks, to avoid spamming the updates
                    let output = null;
                    let outputCount = 0;
                    let outputThreshold = 100;

                    job.verbose(`Parsing uploaded CSV file "${csvFile.originalname}" (${csvFile.size} bytes)`);
                    job.verbose(`----------------------------------------`);
                    const csvStream = streamifier.createReadStream(csvFile.buffer, {encoding: 'utf8'});
                    const csvConverter = csvtojson({
                        colParser:{
                            instance: 'number',
                            score_perc: 'number',
                            points: 'number',
                        },
                        maxRowLength: 1000,
                    });
                    let successCount = 0, errorCount = 0;
                    csvConverter
                        .fromStream(csvStream)
                        .subscribe((json, number) => {
                            return new Promise((resolve, _reject) => {
                                const msg = `Processing CSV record ${number}: ${JSON.stringify(json)}`;
                                if (output == null) {
                                    output = msg;
                                } else {
                                    output += '\n' + msg;
                                }
                                module.exports._updateAssessmentInstanceFromJson(json, assessment_id, authn_user_id, (err) => {
                                    if (err) {
                                        errorCount++;
                                        const msg = String(err);
                                        if (output == null) {
                                            output = msg;
                                        } else {
                                            output += '\n' + msg;
                                        }
                                    } else {
                                        successCount++;
                                    }
                                    outputCount++;
                                    if (outputCount >= outputThreshold) {
                                        job.verbose(output);
                                        output = null;
                                        outputCount = 0;
                                        outputThreshold *= 2; // exponential backoff
                                    }
                                    resolve();
                                });
                            });
                        })
                        .then(() => {
                            if (output != null) {
                                job.verbose(output);
                            }
                            job.verbose(`----------------------------------------`);
                            if (errorCount == 0) {
                                job.verbose(`Successfully updated scores for ${successCount} assessment instances, with no errors`);
                                job.succeed();
                            } else {
                                job.verbose(`Successfully updated scores for ${successCount} assessment instances`);
                                job.fail(`Error updating ${errorCount} assessment instances`);
                            }
                        })
                        .catch((err) => {
                            if (output != null) {
                                job.verbose(output);
                            }
                            job.fail('Error processing CSV', err);
                        });
                });
            });
        });
    },

    // missing values and empty strings get mapped to null
    _getJsonPropertyOrNull(json, key) {
        const value = _.get(json, key, null);
        if (value == '') {
            return null;
        }
        return value;
    },

    // "feedback" gets mapped to {manual: "XXX"} and overrides the contents of "feedback_json"
    _getFeedbackOrNull(json) {
        const feedback_string = module.exports._getJsonPropertyOrNull(json, 'feedback');
        const feedback_json = module.exports._getJsonPropertyOrNull(json, 'feedback_json');
        let feedback = null;
        if (feedback_string != null) {
            feedback = {manual: feedback_string};
        }
        if (feedback_json != null) {
            let feedback_obj = null;
            try {
                feedback_obj = JSON.parse(feedback_json);
            } catch (e) {
                throw new Error(`Unable to parse "feedback_json" field as JSON: ${e}`);
            }
            if (!_.isPlainObject(feedback_obj)) {
                throw new Error(`Parsed "feedback_json" is not a JSON object: ${feedback_obj}`);
            }
            feedback = feedback_obj;
            if (feedback_string != null) {
                feedback.manual = feedback_string;
            }
        }
        return feedback;
    },

    _updateInstanceQuestionFromJson(json, assessment_id, authn_user_id, callback) {
        util.callbackify(async () => {
            const params = [
                assessment_id,
                module.exports._getJsonPropertyOrNull(json, 'submission_id'),
                module.exports._getJsonPropertyOrNull(json, 'uid'),
                module.exports._getJsonPropertyOrNull(json, 'instance'),
                module.exports._getJsonPropertyOrNull(json, 'qid'),
                module.exports._getJsonPropertyOrNull(json, 'score_perc'),
                module.exports._getJsonPropertyOrNull(json, 'points'),
                module.exports._getFeedbackOrNull(json),
                authn_user_id,
            ];
            await sqldb.callAsync('instance_questions_update_score', params);
        })(callback);
    },

    _updateAssessmentInstanceFromJson(json, assessment_id, authn_user_id, callback) {
        if (!_.has(json, 'uid')) return callback(new Error('"uid" not found'));
        if (!_.has(json, 'instance')) return callback(new Error('"instance" not found'));

        const params = {
            assessment_id,
            uid: json.uid,
            instance_number: json.instance,
        };
        sqldb.queryOneRow(sql.select_assessment_instance, params, function(err, result) {
            if (err) return callback(new Error(`unable to locate instance ${json.instance} for ${json.uid}`));
            const assessment_instance_id = result.rows[0].assessment_instance_id;

            if (_.has(json, 'score_perc')) {
                const params = [
                    assessment_instance_id,
                    json.score_perc,
                    authn_user_id,
                ];
                sqldb.call('assessment_instances_update_score_perc', params, (err, _result) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            } else if (_.has(json, 'points')) {
                const params = [
                    assessment_instance_id,
                    json.points,
                    authn_user_id,
                ];
                sqldb.call('assessment_instances_update_points', params, (err, _result) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            } else {
                return callback(new Error('must specify either "score_perc" or "points"'));
            }
        });
    },
};
