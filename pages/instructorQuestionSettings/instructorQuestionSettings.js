const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const async = require('async');
const error = require('@prairielearn/prairielib/error');
const question = require('../../lib/question');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const logger = require('../../lib/logger');
const { QuestionRenameEditor, QuestionDeleteEditor, QuestionCopyEditor, QuestionEditThumbnailEditor, ThumbnailUploadEditor } = require('../../lib/editors');
const config = require('../../lib/config');
const sql = sqlLoader.loadSqlEquiv(__filename);
const { encodePath } = require('../../lib/uri-util');


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
        if (!req.body.id) return next(new Error(`Invalid QID (was falsey): ${req.body.id}`));
        if (!/^[-A-Za-z0-9_/]+$/.test(req.body.id)) return next(new Error(`Invalid QID (was not only letters, numbers, dashes, slashes, and underscores, with no spaces): ${req.body.id}`));
        let qid_new;
        try {
            qid_new = path.normalize(req.body.id);
        } catch(err) {
            return next(new Error(`Invalid QID (could not be normalized): ${req.body.id}`));
        }
        if (res.locals.question.qid == qid_new) {
            debug('The new qid is the same as the old qid - do nothing');
            res.redirect(req.originalUrl);
        } else {
            const editor = new QuestionRenameEditor({
                locals: res.locals,
                qid_new: qid_new,
            });
            editor.canEdit((err) => {
                if (ERR(err, next)) return;
                editor.doEdit((err, job_sequence_id) => {
                    if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
                        res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
                    } else {
                        res.redirect(req.originalUrl);
                    }
                });
            });
        }
    } else if (req.body.__action == 'select_thumbnail') {
        debug('Selecting thumbnail');
        if (!req.body.thumbnail_info) return next(new Error(`Invalid input (was falsey): ${req.body.thumbnail_info}`));
        let info = JSON.parse(req.body.thumbnail_info);
        let thumbnail_filename_new = info.filename;
        let filename_location_new = info.location;
        if (res.locals.question.filename_location == filename_location_new && res.locals.question.thumbnail_filename == thumbnail_filename_new) {
            debug('The thumbnail information is the same as the old information - do nothing');
            res.redirect(req.originalUrl);
        } else {
            const editor = new QuestionEditThumbnailEditor({
                locals: res.locals,
                thumbnail_filename_new: thumbnail_filename_new,
                filename_location_new: filename_location_new,
            });
            editor.canEdit((err) => {
              if (ERR(err, next)) return;
              editor.doEdit((err, job_sequence_id) => {
                  if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
                      res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
                  } else {
                      res.redirect(req.originalUrl);
                  }
              });
            });
        }
    } else if (req.body.__action == 'upload_thumbnail') {
        debug('Upload thumbnail');
        let container = {
            rootPath: path.join(res.locals.course.path, 'questions', res.locals.question.qid),
            invalidRootPaths: [],
        };
        let location;
        if (req.body.location == 'question') {
            location = path.join(res.locals.course.path, 'questions', res.locals.question.qid, req.file.originalname);
        } else if (req.body.location == 'clientFilesCourse') {
            container.rootPath = path.join(res.locals.course.path, 'clientFilesCourse', 'thumbnails');
            location = path.join(res.locals.course.path, 'clientFilesCourse', 'thumbnails', req.file.originalname);
        } else if (req.body.location == 'clientFilesQuestion') {
            container.rootPath = path.join(res.locals.course.path, 'questions', res.locals.question.qid, 'clientFilesQuestion');
            location = path.join(res.locals.course.path, 'questions', res.locals.question.qid, 'clientFilesQuestion', req.file.originalname);
        }
        const editor = new ThumbnailUploadEditor({
            locals: res.locals,
            container: container,
            filePath: location,
            fileContents: req.file.buffer,
            thumbnail_filename_new: req.file.originalname,
            filename_location_new: req.body.location,
        });
        editor.shouldEdit((err, yes) => {
            if (ERR(err, next)) return;
            if (!yes) return res.redirect(req.originalUrl);
            editor.canEdit((err) => {
                if (ERR(err, next)) return;
                editor.doEdit((err, job_sequence_id) => {
                    if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
                        res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
                    } else {
                        res.redirect(req.originalUrl);
                    }
                });
            });
        });
    } else if (req.body.__action == 'copy_question') {
        debug('Copy question');
        if (req.body.to_course_id == res.locals.course.id) {
            // In this case, we are making a duplicate of this question in the same course
            const editor = new QuestionCopyEditor({
                locals: res.locals,
            });
            editor.canEdit((err) => {
                if (ERR(err, next)) return;
                editor.doEdit((err, job_sequence_id) => {
                    if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
                        res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
                    } else {
                        debug(`Get question_id from uuid=${editor.uuid} with course_id=${res.locals.course.id}`);
                        sqldb.queryOneRow(sql.select_question_id_from_uuid, {uuid: editor.uuid, course_id: res.locals.course.id}, (err, result) => {
                            if (ERR(err, next)) return;
                            res.redirect(res.locals.urlPrefix + '/question/' + result.rows[0].question_id + '/settings');
                        });
                    }
                });
            });
        } else {
            // In this case, we are sending a copy of this question to a different course
            debug(`send copy of question: to_course_id = ${req.body.to_course_id}`);
            let params = {
                from_course_id: res.locals.course.id,
                to_course_id: req.body.to_course_id,
                user_id: res.locals.user.user_id,
                transfer_type: 'CopyQuestion',
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
        const editor = new QuestionDeleteEditor({
            locals: res.locals,
        });
        editor.canEdit((err) => {
            if (ERR(err, next)) return;
            editor.doEdit((err, job_sequence_id) => {
                if (ERR(err, (e) => logger.error('Error in doEdit()', e))) {
                    res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
                } else {
                    res.redirect(res.locals.urlPrefix + '/course_admin/questions');
                }
            });
        });
    } else {
        next(error.make(400, 'unknown __action: ' + req.body.__action, {
            locals: res.locals,
            body: req.body,
        }));
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
            } else if (res.locals.course.example_course) {
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
        (callback) => {
            const clientFilesCoursePath = encodePath(path.join(res.locals.course.path, 'clientFilesCourse', 'thumbnails'));
            const clientFilesQuestionPath = encodePath(path.join(res.locals.course.path, 'questions', res.locals.question.qid, 'clientFilesQuestion'));
            const questionPath = encodePath(path.join(res.locals.course.path, 'questions', res.locals.question.qid));
            const publicPath = encodePath('public/images/thumbnails');
            res.locals.available_thumbnails = [];
            async.series([
                (callback) => {
                    fs.readdir(clientFilesCoursePath, function (err, files) {
                        // Probably no clientFilesCourse directory
                        if (err && err.code == 'ENOENT') {
                            callback(null, {});
                            return;
                        } else if (ERR(err, callback)) {
                            return;
                        }

                        let images = [];
                        files.forEach(function (file) {
                            let ext = file.split('.').pop();
                            if (ext == 'jpg' || ext == 'png' || ext == 'jpeg' || ext == 'svg' || ext == 'gif') {
                                images.push({filename: file, location:'clientFilesCourse'});
                            }
                        });
                        callback(null, images);
                    });
                },
                (callback) => {
                    fs.readdir(clientFilesQuestionPath, function (err, files) {
                        if (err && err.code == 'ENOENT') {
                            callback(null, {});
                            return;
                        } else if (ERR(err, callback)) {
                            return;
                        }

                        let images = [];
                        files.forEach(function (file) {
                            let ext = file.split('.').pop();
                            if (ext == 'jpg' || ext == 'png' || ext == 'jpeg' || ext == 'svg' || ext == 'gif') {
                                images.push({filename: file, location:'clientFilesQuestion'});
                            }
                        });
                        callback(null, images);
                    });
                },
                (callback) => {
                    fs.readdir(questionPath, function (err, files) {
                        if (err && err.code == 'ENOENT') {
                            callback(null, {});
                            return;
                        } else if (ERR(err, callback)) {
                            return;
                        }

                        let images = [];
                        files.forEach(function (file) {
                            let ext = file.split('.').pop();
                            if (ext == 'jpg' || ext == 'png' || ext == 'jpeg' || ext == 'svg' || ext == 'gif') {
                                images.push({filename: file, location:'question'});
                            }
                        });
                        callback(null, images);
                    });
                },
                (callback) => {
                    fs.readdir(publicPath, function (err, files) {
                        if (err && err.code == 'ENOENT') {
                            callback(null, {});
                            return;
                        } else if (ERR(err, callback)) {
                            return;
                        }

                        let images = [];
                        files.forEach(function (file) {
                            let ext = file.split('.').pop();
                            if (ext == 'jpg' || ext == 'png' || ext == 'jpeg' || ext == 'svg' || ext == 'gif') {
                                images.push({filename: file, location:'public'});
                            }
                        });
                        callback(null, images);
                    });
                  },
            ], (err, images) => {
                if (ERR(err, next)) return;
                images.forEach(function (image) {
                    res.locals.available_thumbnails = res.locals.available_thumbnails.concat(image);
                });
                res.locals.available_thumbnails = res.locals.available_thumbnails.filter(function(value) { return value.filename; });
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, next)) return;
        res.locals.infoPath = encodePath(path.join('questions', res.locals.question.qid, 'info.json'));
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
