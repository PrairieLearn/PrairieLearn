const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();
const csvStringify = require('../../lib/nonblocking-csv-stringify');

const async = require('async');
const error = require('@prairielearn/prairielib/error');
const sanitizeName = require('../../lib/sanitize-name');
const question = require('../../lib/question');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const debug = require('debug')('prairielearn:instructorQuestion');
const fs = require('fs-extra');
const path = require('path');
const uuidv4 = require('uuid/v4');
const logger = require('../../lib/logger');
const editHelpers = require('../shared/editHelpers');

const logPageView = require('../../middlewares/logPageView')('instructorQuestion');

const sql = sqlLoader.loadSqlEquiv(__filename);

const filenames = function(locals) {
    const prefix = sanitizeName.questionFilenamePrefix(locals.question, locals.course);
    return {
        questionStatsCsvFilename: prefix + 'stats.csv',
    };
};

function processSubmission(req, res, callback) {
    let variant_id, submitted_answer;
    if (res.locals.question.type == 'Freeform') {
        variant_id = req.body.__variant_id;
        submitted_answer = _.omit(req.body, ['__action', '__csrf_token', '__variant_id']);
    } else {
        if (!req.body.postData) return callback(error.make(400, 'No postData', {locals: res.locals, body: req.body}));
        let postData;
        try {
            postData = JSON.parse(req.body.postData);
        } catch (e) {
            return callback(error.make(400, 'JSON parse failed on body.postData', {locals: res.locals, body: req.body}));
        }
        variant_id = postData.variant ? postData.variant.id : null;
        submitted_answer = postData.submittedAnswer;
    }
    const submission = {
        variant_id: variant_id,
        auth_user_id: res.locals.authn_user.user_id,
        submitted_answer: submitted_answer,
    };
    sqldb.callOneRow('variants_ensure_question', [submission.variant_id, res.locals.question.id], (err, result) => {
        if (ERR(err, callback)) return;
        const variant = result.rows[0];
        if (req.body.__action == 'grade') {
            question.saveAndGradeSubmission(submission, variant, res.locals.question, res.locals.course, (err) => {
                if (ERR(err, callback)) return;
                callback(null, submission.variant_id);
            });
        } else if (req.body.__action == 'save') {
            question.saveSubmission(submission, variant, res.locals.question, res.locals.course, (err) => {
                if (ERR(err, callback)) return;
                callback(null, submission.variant_id);
            });
        } else {
            callback(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
        }
    });
}

function processIssue(req, res, callback) {
    const description = req.body.description;
    if (!_.isString(description) || description.length == 0) {
        return callback(new Error('A description of the issue must be provided'));
    }

    const variant_id = req.body.__variant_id;
    sqldb.callOneRow('variants_ensure_question', [variant_id, res.locals.question.id], (err, _result) => {
        if (ERR(err, callback)) return;

        const course_data = _.pick(res.locals, ['variant', 'question', 'course_instance', 'course']);
        const params = [
            variant_id,
            description, // student message
            'instructor-reported issue', // instructor message
            true, // manually_reported
            true, // course_caused
            course_data,
            {}, // system_data
            res.locals.authn_user.user_id,
        ];
        sqldb.call('issues_insert_for_variant', params, (err) => {
            if (ERR(err, callback)) return;
            callback(null, variant_id);
        });
    });
}

function change_qid_write(edit, callback) {
    async.waterfall([
        (callback) => {
            debug(`Move files from questions/${edit.qid_old} to questions/${edit.qid_new}`);
            const oldPath = path.join(edit.coursePath, 'questions', edit.qid_old);
            const newPath = path.join(edit.coursePath, 'questions', edit.qid_new);
            fs.move(oldPath, newPath, {overwrite: false}, (err) => {
                if (ERR(err, callback)) return;
                edit.pathsToAdd = [
                    oldPath,
                    newPath,
                ];
                edit.commitMessage = `in-browser edit: rename question ${edit.qid_old} to ${edit.qid_new}`;
                callback(null);
            });
        },
        (callback) => {
            debug(`Find all assessments (in all course instances) that contain ${edit.qid_old}`);
            sqldb.query(sql.select_assessments_with_question, {question_id: edit.question_id}, function(err, result) {
                if (ERR(err, callback)) return;
                callback(null, result.rows);
            });
        },
        (assessments, callback) => {
            debug(`For each assessment, read/write infoAssessment.json to replace ${edit.qid_old} with ${edit.qid_new}`);
            // TODO: is it safe to run in parallel given that all modify the single array edit.pathsToAdd?
            async.eachSeries(assessments, (assessment, callback) => {
                let infoPath = path.join(edit.coursePath,
                                         'courseInstances',
                                         assessment.course_instance_directory,
                                         'assessments',
                                         assessment.assessment_directory,
                                         'infoAssessment.json');
                edit.pathsToAdd.push(infoPath);
                async.waterfall([
                    (callback) => {
                        debug(`Read ${infoPath}`);
                        fs.readJson(infoPath, (err, infoJson) => {
                            if (ERR(err, callback)) return;
                            callback(null, infoJson);
                        });
                    },
                    (infoJson, callback) => {
                        debug(`Find/replace QID in ${infoPath}`);
                        let found = false;
                        infoJson.zones.forEach((zone) => {
                            zone.questions.forEach((question) => {
                                if (question.alternatives) {
                                    question.alternatives.forEach((alternative) => {
                                        if (alternative.id == edit.qid_old) {
                                            alternative.id = edit.qid_new;
                                            found = true;
                                        }
                                    });
                                } else if (question.id == edit.qid_old) {
                                    question.id = edit.qid_new;
                                    found = true;
                                }
                            });
                        });
                        if (! found) logger.info(`Should have but did not find ${edit.qid_old} in ${infoPath}`);
                        debug(`Write ${infoPath}`);
                        fs.writeJson(infoPath, infoJson, {spaces: 4}, (err) => {
                            if (ERR(err, callback)) return;
                            callback(null);
                        });
                    },
                ], (err) => {
                    if (ERR(err, callback)) return;
                    callback(null);
                });
            }, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function delete_write(edit, callback) {
    debug(`Delete questions/${edit.qid}`);
    const questionPath = path.join(edit.coursePath, 'questions', edit.qid);
    // This will silently do nothing if questionPath no longer exists.
    fs.remove(questionPath, (err) => {
        if (ERR(err, callback)) return;
        edit.pathsToAdd = [
            questionPath,
        ];
        edit.commitMessage = `in-browser edit: delete question ${edit.qid}`;
        callback(null);
    });
}

function copy_write(edit, callback) {
    async.waterfall([
        (callback) => {
            debug(`Generate unique QID`);
            fs.readdir(path.join(edit.coursePath, 'questions'), (err, filenames) => {
                if (ERR(err, callback)) return;

                let number = 1;
                filenames.forEach((filename) => {
                    let found = filename.match(/^question-([0-9]+)$/);
                    if (found) {
                        const foundNumber = parseInt(found[1]);
                        if (foundNumber >= number) {
                            number = foundNumber + 1;
                        }
                    }
                });

                edit.qid = `question-${number}`;
                edit.questionPath = path.join(edit.coursePath, 'questions', edit.qid);
                edit.pathsToAdd = [
                    edit.questionPath,
                ];
                edit.commitMessage = `in-browser edit: add question ${edit.qid}`;
                callback(null);
            });
        },
        (callback) => {
            debug(`Copy template\n from ${edit.templatePath}\n to ${edit.questionPath}`);
            fs.copy(edit.templatePath, edit.questionPath, {overwrite: false, errorOnExist: true}, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            debug(`Read info.json`);
            fs.readJson(path.join(edit.questionPath, 'info.json'), (err, infoJson) => {
                if (ERR(err, callback)) return;
                callback(null, infoJson);
            });
        },
        (infoJson, callback) => {
            debug(`Write info.json with new title and uuid`);
            infoJson.title = 'Replace this title';
            infoJson.uuid = uuidv4();
            fs.writeJson(path.join(edit.questionPath, 'info.json'), infoJson, {spaces: 4}, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

router.post('/', function(req, res, next) {
    if (req.body.__action == 'grade' || req.body.__action == 'save') {
        processSubmission(req, res, function(err, variant_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/question/' + res.locals.question.id
                         + '/?variant_id=' + variant_id);
        });
    } else if (req.body.__action == 'test_once') {
        const count = 1;
        const showDetails = true;
        question.startTestQuestion(count, showDetails, res.locals.question, res.locals.course_instance, res.locals.course, res.locals.authn_user.user_id, (err, job_sequence_id) => {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.__action == 'test_100') {
        if (res.locals.question.grading_method !== 'External') {
            const count = 100;
            const showDetails = false;
            question.startTestQuestion(count, showDetails, res.locals.question, res.locals.course_instance, res.locals.course, res.locals.authn_user.user_id, (err, job_sequence_id) => {
                if (ERR(err, next)) return;
                res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
            });
        } else {
            next(new Error('Not supported for externally-graded questions'));
        }
    } else if (req.body.__action == 'report_issue') {
        processIssue(req, res, function(err, variant_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/question/' + res.locals.question.id
                         + '/?variant_id=' + variant_id);
        });
    } else if (req.body.__action == 'change_id') {
        debug(`Change qid from ${res.locals.question.qid} to ${req.body.id}`);
        if (!res.locals.authz_data.has_course_permission_edit) return next(new Error('Access denied'));

        // Do not allow users to edit the exampleCourse
        if (res.locals.course.options.isExampleCourse) {
            return next(error.make(400, `attempting to edit the example course`, {
                locals: res.locals,
                body: req.body,
            }));
        }

        if (res.locals.question.qid == req.body.id) {
            debug('The new qid is the same as the old qid - do nothing');
            res.redirect(req.originalUrl);
        } else {
            let edit = {
                userID: res.locals.user.user_id,
                courseID: res.locals.course.id,
                coursePath: res.locals.course.path,
                uid: res.locals.user.uid,
                user_name: res.locals.user.name,
                qid_old: res.locals.question.qid,
                qid_new: req.body.id,
                question_id: res.locals.question.id,
            };

            edit.description = 'Change question ID in browser and sync';
            edit.write = change_qid_write;
            editHelpers.doEdit(edit, res.locals, (err, job_sequence_id) => {
                if (ERR(err, (e) => logger.error(e))) {
                    res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
                } else {
                    res.redirect(req.originalUrl);
                }
            });
        }
    } else if (req.body.__action == 'copy_question') {
        debug('Copy question');

        if (!res.locals.authz_data.has_course_permission_edit) return next(new Error('Access denied'));

        // Do not allow users to edit the exampleCourse
        if (res.locals.course.options.isExampleCourse) {
            return next(error.make(400, `attempting to edit example course`, {
                locals: res.locals,
                body: req.body,
            }));
        }

        let edit = {
            userID: res.locals.user.user_id,
            courseID: res.locals.course.id,
            coursePath: res.locals.course.path,
            uid: res.locals.user.uid,
            user_name: res.locals.user.name,
            templatePath: path.join(res.locals.course.path, 'questions', res.locals.question.qid),
        };

        edit.description = 'Copy question in browser and sync';
        edit.write = copy_write;
        editHelpers.doEdit(edit, res.locals, (err, job_sequence_id) => {
            if (ERR(err, (e) => logger.error(e))) {
                res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
            } else {
                debug(`Get question_id from qid=${edit.qid} with course_id=${edit.courseID}`);
                sqldb.queryOneRow(sql.select_question_id_from_qid, {qid: edit.qid, course_id: edit.courseID}, function(err, result) {
                    if (ERR(err, next)) return;
                    res.redirect(res.locals.urlPrefix + '/question/' + result.rows[0].question_id);
                });
            }
        });
    } else if (req.body.__action == 'delete_question') {
        debug('Delete question');

        if (!res.locals.authz_data.has_course_permission_edit) return next(new Error('Access denied'));

        // Do not allow users to edit the exampleCourse
        if (res.locals.course.options.isExampleCourse) {
            return next(error.make(400, `attempting to edit example course`, {
                locals: res.locals,
                body: req.body,
            }));
        }

        let edit = {
            userID: res.locals.user.user_id,
            courseID: res.locals.course.id,
            coursePath: res.locals.course.path,
            uid: res.locals.user.uid,
            user_name: res.locals.user.name,
            qid: res.locals.question.qid,
        };

        edit.description = 'Delete question in browser and sync';
        edit.write = delete_write;
        editHelpers.doEdit(edit, res.locals, (err, job_sequence_id) => {
            if (ERR(err, (e) => logger.error(e))) {
                res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
            } else {
                res.redirect(res.locals.urlPrefix + '/course_admin/questions');
            }
        });
    } else {
        return next(new Error('unknown __action: ' + req.body.__action));
    }
});

router.get('/', function(req, res, next) {
    var variant_seed = req.query.variant_seed ? req.query.variant_seed : null;
    debug(`variant_seed ${variant_seed}`);
    async.series([
        (callback) => {
            debug('set filenames');
            _.assign(res.locals, filenames(res.locals));
            callback(null);
        },
        (callback) => {
            sqldb.query(sql.assessment_question_stats, {question_id: res.locals.question.id}, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.assessment_stats = result.rows;
                callback(null);
            });
        },
        (callback) => {
            res.locals.question_attempts_histogram = null;
            res.locals.question_attempts_before_giving_up_histogram = null;
            res.locals.question_attempts_histogram_hw = null;
            res.locals.question_attempts_before_giving_up_histogram_hw = null;
            // res.locals.question_attempts_histogram = res.locals.result.question_attempts_histogram;
            // res.locals.question_attempts_before_giving_up_histogram = res.locals.result.question_attempts_before_giving_up_histogram;
            // res.locals.question_attempts_histogram_hw = res.locals.result.question_attempts_histogram_hw;
            // res.locals.question_attempts_before_giving_up_histogram_hw = res.locals.result.question_attempts_before_giving_up_histogram_hw;
            callback(null);
        },
        (callback) => {
            // req.query.variant_id might be undefined, which will generate a new variant
            question.getAndRenderVariant(req.query.variant_id, variant_seed, res.locals, function(err) {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            logPageView(req, res, (err) => {
                if (ERR(err, next)) return;
                callback(null);
            });
        },
        (callback) => {
            res.locals.questionGHLink = null;
            if (res.locals.course.repository) {
                const GHfound = res.locals.course.repository.match(/^git@github.com:\/?(.+?)(\.git)?\/?$/);
                if (GHfound) {
                    res.locals.questionGHLink = 'https://github.com/' + GHfound[1] + '/tree/master/questions/' + res.locals.question.qid;
                }
            } else if (res.locals.course.options.isExampleCourse) {
                res.locals.questionGHLink = `https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/${res.locals.question.qid}`;
            }
            callback(null);
        },
        (callback) => {
            sqldb.queryOneRow(sql.qids, {course_id: res.locals.course.id}, (err, result) => {
                if (ERR(err, callback)) return;
                res.locals.qids = result.rows[0].qids;
                callback(null);
            });
        },
        (callback) => {
            sqldb.query(sql.select_assessments_with_question_for_display, {question_id: res.locals.question.id}, (err, result) => {
                if (ERR(err, callback)) return;
                res.locals.a_with_q_for_all_ci = result.rows[0].assessments_from_question_id;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, next)) return;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.get('/:filename', function(req, res, next) {
    _.assign(res.locals, filenames(res.locals));

    if (req.params.filename === res.locals.questionStatsCsvFilename) {
        sqldb.query(sql.assessment_question_stats, {question_id: res.locals.question.id}, function(err, result) {
            if (ERR(err, next)) return;
            var questionStatsList = result.rows;
            var csvData = [];
            var csvHeaders = ['Course instance', 'Assessment'];
            Object.keys(res.locals.stat_descriptions).forEach(key => {
                csvHeaders.push(res.locals.stat_descriptions[key].non_html_title);
            });

            csvData.push(csvHeaders);

            _(questionStatsList).each(function(questionStats) {
                var questionStatsData = [];
                questionStatsData.push(questionStats.course_title);
                questionStatsData.push(questionStats.label);
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
    } else {
        next(new Error('Unknown filename: ' + req.params.filename));
    }
});
module.exports = router;
