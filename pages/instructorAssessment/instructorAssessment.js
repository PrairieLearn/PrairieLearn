var ERR = require('async-stacktrace');
var _ = require('lodash');
var async = require('async');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();
var debug = require('debug')('prairielearn:instructorAssessment');

var error = require('../../lib/error');
var logger = require('../../lib/logger');
var serverJobs = require('../../lib/server-jobs');
var csvMaker = require('../../lib/csv-maker');
var dataFiles = require('../../lib/data-files');
var assessment = require('../../lib/assessment');
var sqldb = require('../../lib/sqldb');
var sqlLoader = require('../../lib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

var sanitizeName = function(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '_');
};

var filenames = function(locals) {
    var prefix = sanitizeName(locals.course.short_name)
        + '_'
        + sanitizeName(locals.course_instance.short_name)
        + '_'
        + sanitizeName(locals.assessment_set.abbreviation)
        + sanitizeName(locals.assessment.number)
        + '_';
    return {
        scoreStatsCsvFilename:          prefix + 'score_stats.csv',
        durationStatsCsvFilename:       prefix + 'duration_stats.csv',
        scoresCsvFilename:              prefix + 'scores.csv',
        scoresAllCsvFilename:           prefix + 'scores_all.csv',
        scoresByUsernameCsvFilename:    prefix + 'scores_by_username.csv',
        scoresByUsernameAllCsvFilename: prefix + 'scores_by_username_all.csv',
        pointsCsvFilename:              prefix + 'points.csv',
        pointsAllCsvFilename:           prefix + 'points_all.csv',
        pointsByUsernameCsvFilename:    prefix + 'points_by_username.csv',
        pointsByUsernameAllCsvFilename: prefix + 'points_by_username_all.csv',
        instancesCsvFilename:           prefix + 'instances.csv',
        instancesAllCsvFilename:        prefix + 'instances_all.csv',
        finalSubmissionsCsvFilename:    prefix + 'final_submissions.csv',
        allSubmissionsCsvFilename:      prefix + 'all_submissions.csv',
        finalFilesZipFilename:          prefix + 'final_files.zip',
        allFilesZipFilename:            prefix + 'all_files.zip',
        questionStatsCsvFilename:       prefix + 'question_stats.csv',
        statsByDateCsvFilename:         prefix + 'scores_by_date.csv',
    };
};

router.get('/', function(req, res, next) {
    debug('GET /');
    async.series([
        function(callback) {
          var params = {assessment_id: res.locals.assessment.id};
          sqldb.queryOneRow(sql.assessment_stats_last_updated, params, function(err, result) {
            if (ERR(err, callback)) return;
            res.locals.stats_last_updated = result.rows[0].stats_last_updated;
            callback(null);
          });
        },
        function(callback) {
            debug('set filenames');
            _.assign(res.locals, filenames(res.locals));
            callback(null);
        },
        function(callback) {
            debug('query questions');
            var params = {
                assessment_id: res.locals.assessment.id,
                course_id: res.locals.course.id,
            };
            sqldb.query(sql.questions, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.questions = result.rows;
                callback(null);
            });
        },
        function(callback) {
            debug('query assessment_access_rules');
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.query(sql.assessment_access_rules, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.access_rules = result.rows;
                callback(null);
            });
        },
        function(callback) {
            debug('query assessment_stats');
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.queryOneRow(sql.assessment_stats, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.assessment_stat = result.rows[0];
                callback(null);
           });
        },
        function(callback) {
            debug('query assessment_score_histogram_by_date');
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.query(sql.assessment_score_histogram_by_date, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.assessment_score_histogram_by_date = result.rows;
                callback(null);
            });
        },
        function(callback) {
            debug('query assessment_duration_stats');
            // FIXME: change to assessment_instance_duration_stats and show all instances
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.queryOneRow(sql.assessment_duration_stats, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.duration_stat = result.rows[0];
                callback(null);
            });
        },
        function(callback) {
            debug('query select_regrading_job_sequences');
            var params = {
                assessment_id: res.locals.assessment.id,
            };
            sqldb.query(sql.select_regrading_job_sequences, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.regrading_job_sequences = result.rows;
                callback(null);
            });
        },
        function(callback) {
            debug('query assessment_instance_data');
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.query(sql.select_assessment_instances, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.user_scores = result.rows;
                callback(null);
            });
        },
        function(callback) {
            res.locals.ifNotNullThen = function (x, y) {
                if (x !== null) {
                    return y(x);
                }
            };
            res.locals.parseFloatOne = function(x) {
                return parseFloat(x).toFixed(1);
            };
            res.locals.parseFloatTwo = function(x) {
                return parseFloat(x).toFixed(2);
            };
            callback(null);
        },
    ], function(err) {
        if (ERR(err, next)) return;
        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

var sendInstancesCsv = function(res, req, columns, options, callback) {
    var params = {assessment_id: res.locals.assessment.id};
    sqldb.query(sql.select_assessment_instances, params, function(err, result) {
        if (ERR(err, callback)) return;

        var rows = result.rows;
        if (options.only_highest) {
            rows = _.filter(rows, 'highest_score');
        }

        csvMaker.rowsToCsv(rows, columns, function(err, csv) {
            if (ERR(err, callback)) return;
            res.attachment(req.params.filename);
            res.send(csv);
        });
    });
};

router.get('/:filename', function(req, res, next) {
    _.assign(res.locals, filenames(res.locals));

    var assessmentName = res.locals.assessment_set.name + ' ' + res.locals.assessment.number;
    var scoresColumns = [
        ['UID', 'uid'],
        [assessmentName, 'score_perc'],
    ];
    var scoresByUsernameColumns = [
        ['Username', 'username'],
        [assessmentName, 'score_perc'],
    ];
    var pointsColumns = [
        ['UID', 'uid'],
        [assessmentName, 'points'],
    ];
    var pointsByUsernameColumns = [
        ['Username', 'username'],
        [assessmentName, 'points'],
    ];
    var instancesColumns = [
        ['UID', 'uid'],
        ['Username', 'username'],
        ['Name', 'name'],
        ['Role', 'role'],
        ['Assessment', 'assessment_label'],
        ['Instance', 'number'],
        ['Started', 'date_formatted'],
        ['Remaining', 'time_remaining'],
        ['Score (%)', 'score_perc'],
        ['Points', 'points'],
        ['Max points', 'max_points'],
        ['Duration (min)', 'duration_mins'],
        ['Hightest score', 'highest_score'],
    ];

    if (req.params.filename == res.locals.scoreStatsCsvFilename) {
        let params = {assessment_id: res.locals.assessment.id};
        sqldb.queryOneRow(sql.assessment_stats, params, function(err, result) {
            if (ERR(err, next)) return;
            var assessmentStat = result.rows[0];
            var csvHeaders = ['Course', 'Instance', 'Set', 'Number', 'Assessment', 'Title', 'TID', 'NStudents', 'Mean',
                              'Std', 'Min', 'Max', 'Median', 'NZero', 'NHundred', 'NZeroPerc', 'NHundredPerc'];
            var csvData = [
                res.locals.course.short_name,
                res.locals.course_instance.short_name,
                res.locals.assessment_set.name,
                res.locals.assessment.number,
                res.locals.assessment_set.abbreviation + res.locals.assessment.number,
                res.locals.assessment.title,
                res.locals.assessment.tid,
                assessmentStat.number,
                assessmentStat.mean,
                assessmentStat.std,
                assessmentStat.min,
                assessmentStat.max,
                assessmentStat.median,
                assessmentStat.n_zero,
                assessmentStat.n_hundred,
                assessmentStat.n_zero_perc,
                assessmentStat.n_hundred_perc,
            ];
            _(assessmentStat.score_hist).each(function(count, i) {
                csvHeaders.push('Hist ' + (i + 1));
                csvData.push(count);
            });
            csvData = [csvHeaders, csvData];
            csvStringify(csvData, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.durationStatsCsvFilename) {
        let params = {assessment_id: res.locals.assessment.id};
        sqldb.queryOneRow(sql.assessment_duration_stats, params, function(err, result) {
            if (ERR(err, next)) return;
            var durationStat = result.rows[0];
            var csvHeaders = ['Course', 'Instance', 'Set', 'Number', 'Assessment', 'Title', 'TID',
                              'Mean duration (min)', 'Median duration (min)', 'Min duration (min)', 'Max duration (min)'];
            var csvData = [
                res.locals.course.short_name,
                res.locals.course_instance.short_name,
                res.locals.assessment_set.name,
                res.locals.assessment.number,
                res.locals.assessment_set.abbreviation + res.locals.assessment.number,
                res.locals.assessment.title,
                res.locals.assessment.tid,
                durationStat.mean_mins,
                durationStat.median_mins,
                durationStat.min_mins,
                durationStat.max_mins,
            ];
            _(durationStat.threshold_seconds).each(function(count, i) {
                csvHeaders.push('Hist boundary ' + (i + 1) + ' (s)');
                csvData.push(count);
            });
            _(durationStat.hist).each(function(count, i) {
                csvHeaders.push('Hist' + (i + 1));
                csvData.push(count);
            });
            csvData = [csvHeaders, csvData];
            csvStringify(csvData, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.scoresCsvFilename) {
        sendInstancesCsv(res, req, scoresColumns, {only_highest: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.scoresAllCsvFilename) {
        sendInstancesCsv(res, req, scoresColumns, {only_highest: false}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.scoresByUsernameCsvFilename) {
        sendInstancesCsv(res, req, scoresByUsernameColumns, {only_highest: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.scoresByUsernameAllCsvFilename) {
        sendInstancesCsv(res, req, scoresByUsernameColumns, {only_highest: false}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.pointsCsvFilename) {
        sendInstancesCsv(res, req, pointsColumns, {only_highest: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.pointsAllCsvFilename) {
        sendInstancesCsv(res, req, pointsColumns, {only_highest: false}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.pointsByUsernameCsvFilename) {
        sendInstancesCsv(res, req, pointsByUsernameColumns, {only_highest: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.pointsByUsernameAllCsvFilename) {
        sendInstancesCsv(res, req, pointsByUsernameColumns, {only_highest: false}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.instancesCsvFilename) {
        sendInstancesCsv(res, req, instancesColumns, {only_highest: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.instancesAllCsvFilename) {
        sendInstancesCsv(res, req, instancesColumns, {only_highest: false}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.allSubmissionsCsvFilename
               || req.params.filename == res.locals.finalSubmissionsCsvFilename) {
        let include_all = (req.params.filename == res.locals.allSubmissionsCsvFilename);
        let params = {
            assessment_id: res.locals.assessment.id,
            include_all: include_all,
        };
        sqldb.query(sql.assessment_instance_submissions, params, function(err, result) {
            if (ERR(err, next)) return;
            var columns = [
                ['UID', 'uid'],
                ['Name', 'name'],
                ['Role', 'role'],
                ['Assessment', 'assessment_label'],
                ['Assessment instance', 'assessment_instance_number'],
                ['Question', 'qid'],
                ['Question instance', 'instance_question_number'],
                ['Variant', 'variant_number'],
                ['Seed', 'variant_seed'],
                ['Params', 'params'],
                ['True answer', 'true_answer'],
                ['Options', 'options'],
                ['Submission date', 'submission_date_formatted'],
                ['Submitted answer', 'submitted_answer'],
                ['Override score', 'override_score'],
                ['Credit', 'credit'],
                ['Mode', 'mode'],
                ['Grading requested date', 'grading_requested_at_formatted'],
                ['Grading date', 'graded_at_formatted'],
                ['Score', 'score'],
                ['Correct', 'correct'],
                ['Feedback', 'feedback'],
            ];
            if (!include_all) {
                columns = columns.concat([
                    ['Question points', 'points'],
                    ['Max points', 'max_points'],
                    ['Question % score', 'score_perc'],
                ]);
            }
            csvMaker.rowsToCsv(result.rows, columns, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.allFilesZipFilename
               || req.params.filename == res.locals.finalFilesZipFilename) {
        let include_all = (req.params.filename == res.locals.allFilesZipFilename);
        let params = {
            assessment_id: res.locals.assessment.id,
            include_all: include_all,
        };
        sqldb.query(sql.assessment_instance_files, params, function(err, result) {
            if (ERR(err, next)) return;
            var dirname = (res.locals.assessment_set.name + res.locals.assessment.number).replace(' ', '');
            dataFiles.filesToZipBuffer(result.rows, dirname, function(err, zipBuffer) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(zipBuffer);
            });
        });
    } else if (req.params.filename === res.locals.questionStatsCsvFilename) {
        var params = {
            assessment_id: res.locals.assessment.id,
            course_id: res.locals.course.id,
        };
        sqldb.query(sql.questions, params, function(err, result) {
            if (ERR(err, next)) return;
            var questionStatsList = result.rows;
            var csvData = [];
            var csvHeaders = ['Question number', 'Question title'];
            Object.keys(res.locals.stat_descriptions).forEach(key => {
                csvHeaders.push(res.locals.stat_descriptions[key].non_html_title);
            });

            csvData.push(csvHeaders);

            _(questionStatsList).each(function(questionStats) {
                var questionStatsData = [];
                questionStatsData.push(questionStats.number);
                questionStatsData.push(questionStats.title);
                questionStatsData.push(questionStats.mean_question_score);
                questionStatsData.push(questionStats.question_score_variance);
                questionStatsData.push(questionStats.discrimination);
                questionStatsData.push(questionStats.some_submission_perc);
                questionStatsData.push(questionStats.some_perfect_submission_perc);
                questionStatsData.push(questionStats.some_nonzero_submission_perc);
                questionStatsData.push(questionStats.average_first_submission_score);
                questionStatsData.push(questionStats.first_submission_score_variance);
                questionStatsData.push(questionStats.first_submission_score_hist);
                questionStatsData.push(questionStats.average_last_submission_score);
                questionStatsData.push(questionStats.last_submission_score_variance);
                questionStatsData.push(questionStats.last_submission_score_hist);
                questionStatsData.push(questionStats.average_max_submission_score);
                questionStatsData.push(questionStats.max_submission_score_variance);
                questionStatsData.push(questionStats.max_submission_score_hist);
                questionStatsData.push(questionStats.average_average_submission_score);
                questionStatsData.push(questionStats.average_submission_score_variance);
                questionStatsData.push(questionStats.average_submission_score_hist);
                questionStatsData.push(questionStats.submission_score_array_averages);
                questionStatsData.push(questionStats.incremental_submission_score_array_averages);
                questionStatsData.push(questionStats.incremental_submission_points_array_averages);
                questionStatsData.push(questionStats.average_number_submissions);
                questionStatsData.push(questionStats.number_submissions_variance);
                questionStatsData.push(questionStats.number_submissions_hist);
                questionStatsData.push(questionStats.quintile_question_scores);

                _(questionStats.quintile_scores).each(function(perc) {
                    questionStatsData.push(perc);
                });

                csvData.push(questionStatsData);
            });

            csvStringify(csvData, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.statsByDateCsvFilename) {
        let params = {assessment_id: res.locals.assessment.id};
        sqldb.query(sql.assessment_score_histogram_by_date, params, function(err, result) {
            if (ERR(err, next)) return;
            var scoresByDay = result.rows;

            var csvHeaders = ['Date'];
            _(scoresByDay).each(function(day) {
                csvHeaders.push(day.date_formatted);
            });

            var numDays = scoresByDay.length;
            var numGroups = scoresByDay[0].histogram.length;

            var csvData = [];

            let groupData = ['Number'];
            for (let day = 0; day < numDays; day++) {
                groupData.push(scoresByDay[day].number);
            }
            csvData.push(groupData);

            groupData = ['Mean score perc'];
            for (let day = 0; day < numDays; day++) {
                groupData.push(scoresByDay[day].mean_score_perc);
            }
            csvData.push(groupData);

            for (var group = 0; group < numGroups; group++) {
                groupData = [(group * 10) + '% to ' + ((group + 1) * 10) + '%'];
                for (var day = 0; day < numDays; day++) {
                    groupData.push(scoresByDay[day].histogram[group]);
                }
                csvData.push(groupData);
            }
            csvData.splice(0, 0, csvHeaders);
            csvStringify(csvData, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else {
        next(new Error('Unknown filename: ' + req.params.filename));
    }
});

var regradeAssessmentInstance = function(assessment_instance_id, locals, callback) {
    var params = {assessment_instance_id};
    sqldb.query(sql.select_regrade_assessment_instance_info, params, function(err, result) {
        if (ERR(err, callback)) return;
        var assessment_instance_label = result.rows[0].assessment_instance_label;
        var user_uid = result.rows[0].user_uid;
        var assessment_id = result.rows[0].assessment_id;

        var options = {
            course_id: locals.course.id,
            course_instance_id: locals.course_instance.id,
            assessment_id: assessment_id,
            user_id: locals.user.user_id,
            authn_user_id: locals.authz_data.authn_user.user_id,
            type: 'regrade_assessment_instance',
            description: 'Regrade ' + assessment_instance_label + ' for ' + user_uid,
        };
        serverJobs.createJobSequence(options, function(err, job_sequence_id) {
            if (ERR(err, callback)) return;
            callback(null, job_sequence_id);

            // We've now triggered the callback to our caller, but we
            // continue executing below to launch the jobs themselves.

            var jobOptions = {
                course_id: locals.course.id,
                course_instance_id: locals.course_instance.id,
                assessment_id: assessment_id,
                user_id: locals.user.user_id,
                authn_user_id: locals.authz_data.authn_user.user_id,
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
                    locals.authn_user.user_id,
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
                        job.succeed();
                    }
                });
            });
        });
    });
};

var regradeAllAssessmentInstances = function(assessment_id, locals, callback) {
    var params = {assessment_id};
    sqldb.queryOneRow(sql.select_regrade_assessment_info, params, function(err, result) {
        if (ERR(err, callback)) return;
        var assessment_label = result.rows[0].assessment_label;

        var options = {
            course_id: locals.course.id,
            course_instance_id: locals.course_instance.id,
            assessment_id: assessment_id,
            user_id: locals.user.user_id,
            authn_user_id: locals.authz_data.authn_user.user_id,
            type: 'regrade_assessment',
            description: 'Regrade ' + assessment_label,
        };
        serverJobs.createJobSequence(options, function(err, job_sequence_id) {
            if (ERR(err, callback)) return;
            callback(null, job_sequence_id);

            // We've now triggered the callback to our caller, but we
            // continue executing below to launch the jobs themselves.

            var jobOptions = {
                course_id: locals.course.id,
                course_instance_id: locals.course_instance.id,
                assessment_id: assessment_id,
                user_id: locals.user.user_id,
                authn_user_id: locals.authz_data.authn_user.user_id,
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
                            locals.authn_user.user_id,
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
};

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    if (req.body.__action == 'open') {
        let params = {
            assessment_id: res.locals.assessment.id,
            assessment_instance_id: req.body.assessment_instance_id,
            authn_user_id: res.locals.authz_data.authn_user.user_id,
        };
        sqldb.queryOneRow(sql.open, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'close') {
        var close = true;
        assessment.gradeAssessmentInstance(req.body.assessment_instance_id, res.locals.authn_user.user_id, close, function(err) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'delete') {
        let params = [
            req.body.assessment_instance_id,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('assessment_instances_delete', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'delete_all') {
        let params = [
            req.body.assessment_id,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('assessment_instances_delete_all', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'regrade') {
        regradeAssessmentInstance(req.body.assessment_instance_id, res.locals, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.__action == 'regrade_all') {
        regradeAllAssessmentInstances(req.body.assessment_id, res.locals, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.postAction == 'refresh_stats') {
        var params = [
            req.body.assessment_id
        ];
        sqldb.call('assessment_questions_calculate_stats_for_assessment', params, function(err) {
          if (ERR(err, next)) return;
          res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});
module.exports = router;
