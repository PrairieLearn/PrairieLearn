const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const async = require('async');
const error = require('@prairielearn/prairielib/error');
const question = require('../../lib/question');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const fs = require('fs-extra');
const uuidv4 = require('uuid/v4');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const logger = require('../../lib/logger');
const editHelpers = require('../shared/editHelpers');
const config = require('../../lib/config');
const sql = sqlLoader.loadSqlEquiv(__filename);

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
    if (req.body.__action == 'test_once') {
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

        // Do not allow users to move the question outside the questions directory
        try {
            if (path.dirname(path.normalize(req.body.id)) !== '.') return next(new Error(`Invalid QID: ${req.body.id}`));
        } catch(err) {
            return next(new Error(`Invalid QID: ${req.body.id}`));
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

        if (req.body.to_course_id == res.locals.course.id) {
            // In this case, we are making a duplicate of this question in the same course

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
        } else {
            // In this case, we are sending a copy of this question to a different course
            debug(`send copy of question: to_course_id = ${req.body.to_course_id}`);
            let params = {
                from_course_id: res.locals.course.id,
                to_course_id: req.body.to_course_id,
                user_id: res.locals.user.user_id,
                transfer_type: 'copy_question',
                from_filename: path.join(res.locals.course.path, 'questions', res.locals.question.qid),
            };
            async.waterfall([
                (callback) => {
                    const f = uuidv4();
                    const relDir = path.join(f.slice(0,3), f.slice(3,6));
                    params.storage_filename = path.join(relDir, f.slice(6));
                    if (config.filesRoot == null) return callback(new Error('config.filesRoot is null'));
                    fs.copy(params.from_filename, path.join(config.filesRoot, params.storage_filename), {errorOnExist: true}, (err) => {
                        if (ERR(err, callback)) return;
                        callback(null);
                    });
                },
                (callback) => {
                    sqldb.queryOneRow(sql.insert_file_transfer, params, (err, result) => {
                        if (ERR(err, callback)) return;
                        callback(null, result.rows[0]);
                    });
                },
            ], (err, results) => {
                if (ERR(err, next)) return;
                res.redirect(`${res.locals.plainUrlPrefix}/course/${params.to_course_id}/file_transfer/${results.id}`);
            });
        }
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
        editHelpers.processFileAction(req, res, {container: path.join(res.locals.course.path, 'questions', res.locals.question.qid)}, next);
    }
});

router.get('/', function(req, res, next) {
    async.series([
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

module.exports = router;
