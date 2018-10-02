const ERR = require('async-stacktrace');
const async = require('async');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const logger = require('../lib/logger');
const serverJobs = require('../lib/server-jobs');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);
const ltiOutcomes = require('./ltiOutcomes');

module.exports = {

    regradeAssessmentInstance(assessment_instance_id, user_id, authn_user_id, callback) {
        debug('regradeAssessmentInstance()');
        var params = {assessment_instance_id};
        sqldb.queryOneRow(sql.select_regrade_assessment_instance_info, params, function(err, result) {
            if (ERR(err, callback)) return;
            const assessment_instance_label = result.rows[0].assessment_instance_label;
            const user_uid = result.rows[0].user_uid;
            const assessment_id = result.rows[0].assessment_id;
            const course_instance_id = result.rows[0].course_instance_id;
            const course_id = result.rows[0].course_id;

            var options = {
                course_id: course_id,
                course_instance_id: course_instance_id,
                assessment_id: assessment_id,
                user_id: user_id,
                authn_user_id: authn_user_id,
                type: 'regrade_assessment_instance',
                description: 'Regrade ' + assessment_instance_label + ' for ' + user_uid,
            };
            serverJobs.createJobSequence(options, function(err, job_sequence_id) {
                if (ERR(err, callback)) return;
                callback(null, job_sequence_id);

                // We've now triggered the callback to our caller, but we
                // continue executing below to launch the jobs themselves.

                var jobOptions = {
                    course_id: course_id,
                    course_instance_id: course_instance_id,
                    assessment_id: assessment_id,
                    user_id: user_id,
                    authn_user_id: authn_user_id,
                    type: 'regrade_assessment_instance',
                    description: 'Regrade ' + assessment_instance_label + ' for ' + user_uid,
                    job_sequence_id: job_sequence_id,
                    last_in_sequence: true,
                };
                serverJobs.createJob(jobOptions, function(err, job) {
                    if (err) {
                        logger.error('Error in createJob()', err);
                        serverJobs.failJobSequence(job_sequence_id);
                        return;
                    }
                    job.verbose('Regrading ' + assessment_instance_label + ' for ' + user_uid);
                    var params = [
                        assessment_instance_id,
                        authn_user_id,
                    ];
                    sqldb.call('assessment_instances_regrade', params, function(err, result) {
                        if (ERR(err, function() {})) {
                            job.fail(err);
                        } else {
                            if (result.rowCount != 1) {
                                job.fail(new Error('Incorrect rowCount: ' + result.rowCount));
                            }
                            job.verbose('Regrading complete');
                            var regrade = result.rows[0];
                            if (regrade.updated) {
                                job.verbose('Questions updated: ' + regrade.updated_question_names.join(', '));
                                job.verbose('New score: ' + Math.floor(regrade.new_score_perc) + '% (was ' + Math.floor(regrade.old_score_perc) + '%)');
                            } else {
                                job.verbose('No changes made');
                            }
                            ltiOutcomes.updateScore(assessment_instance_id, null, (err) => {
                                if (err) {
                                    job.fail(err);
                                } else {
                                    job.succeed();
                                }
                            });
                        }
                    });
                });
            });
        });
    },

    regradeAllAssessmentInstances(assessment_id, user_id, authn_user_id, callback) {
        debug('regradeAllAssessmentInstances()');
        var params = {assessment_id};
        sqldb.queryOneRow(sql.select_regrade_assessment_info, params, function(err, result) {
            if (ERR(err, callback)) return;
            const assessment_label = result.rows[0].assessment_label;
            const course_instance_id = result.rows[0].course_instance_id;
            const course_id = result.rows[0].course_id;

            var options = {
                course_id: course_id,
                course_instance_id: course_instance_id,
                assessment_id: assessment_id,
                user_id: user_id,
                authn_user_id: authn_user_id,
                type: 'regrade_assessment',
                description: 'Regrade ' + assessment_label,
            };
            serverJobs.createJobSequence(options, function(err, job_sequence_id) {
                if (ERR(err, callback)) return;
                callback(null, job_sequence_id);

                // We've now triggered the callback to our caller, but we
                // continue executing below to launch the jobs themselves.

                var jobOptions = {
                    course_id: course_id,
                    course_instance_id: course_instance_id,
                    assessment_id: assessment_id,
                    user_id: user_id,
                    authn_user_id: authn_user_id,
                    type: 'regrade_assessment',
                    description: 'Regrade ' + assessment_label,
                    job_sequence_id: job_sequence_id,
                    last_in_sequence: true,
                };
                serverJobs.createJob(jobOptions, function(err, job) {
                    if (err) {
                        logger.error('Error in createJob()', err);
                        serverJobs.failJobSequence(job_sequence_id);
                        return;
                    }
                    job.verbose('Regrading all assessment instances for ' + assessment_label);

                    var params = {assessment_id};
                    sqldb.query(sql.select_regrade_assessment_instances, params, function(err, result) {
                        if (ERR(err, function() {})) return job.fail(err);

                        var updated_count = 0;
                        var error_count = 0;

                        // acculumate output lines in the "output" variable and actually
                        // output put them every 100 lines, to avoid spamming the updates
                        var output = null;
                        var output_count = 0;
                        async.eachSeries(result.rows, function(row, callback) {
                            var params = [
                                row.assessment_instance_id,
                                authn_user_id,
                            ];
                            sqldb.callOneRow('assessment_instances_regrade', params, function(err, result) {
                                var msg;
                                if (ERR(err, function() {})) {
                                    logger.error('error while regrading', {jobOptions, row, err});
                                    error_count++;
                                    msg = 'ERROR updating ' + row.assessment_instance_label + ' for ' + row.user_uid;
                                } else {
                                    var regrade = result.rows[0];
                                    msg = 'Regraded ' + row.assessment_instance_label + ' for ' + row.user_uid + ': ';
                                    if (regrade.updated) {
                                        updated_count++;
                                        msg += 'New score: ' + Math.floor(regrade.new_score_perc)
                                            + '% (was ' + Math.floor(regrade.old_score_perc) + '%), '
                                            + 'Questions updated: ' + regrade.updated_question_names.join(', ');
                                    } else {
                                        msg += 'No changes made';
                                    }
                                }
                                ltiOutcomes.updateScore(row.assessment_instance_id, null, (err) => {
                                    if (err) {
                                        msg += '\n' + 'ERROR updating score via LTI: ' + err.toString();
                                    }
                                    if (output == null) {
                                        output = msg;
                                    } else {
                                        output += '\n' + msg;
                                    }
                                    output_count++;
                                    if (output_count >= 100) {
                                        job.verbose(output);
                                        output = null;
                                        output_count = 0;
                                    }
                                    callback(null);
                                });
                            });
                        }, function(err) {
                            if (output_count > 0) {
                                job.verbose(output);
                            }
                            if (ERR(err, function() {})) return job.fail(err);
                            job.verbose('Regrading complete');
                            job.verbose('Number of assessment instances updated: ' + updated_count);
                            if (error_count > 0) {
                                job.verbose('Number of errors: ' + error_count);
                                job.fail(new Error('Errors occurred while regrading, see output for details'));
                            } else {
                                job.succeed();
                            }
                        });
                    });
                });
            });
        });
    },
};
