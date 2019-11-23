var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();
const async = require('async');
const error = require('@prairielearn/prairielib/error');
const fs = require('fs-extra');
const path = require('path');
const uuidv4 = require('uuid/v4');
const logger = require('../../lib/logger');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

const editHelpers = require('../shared/editHelpers');

router.get('/', function(req, res, next) {
    const course_instance_id = res.locals.course_instance ? res.locals.course_instance.id : null;
    var params = {
        course_instance_id: course_instance_id,
        course_id: res.locals.course.id,
    };
    sqldb.query(sql.questions, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.questions = result.rows;

        var params = {
            course_id: res.locals.course.id,
        };
        sqldb.query(sql.tags, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.all_tags = result.rows;

            var params = {
                course_instance_id: course_instance_id,
            };
            sqldb.query(sql.assessments, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.all_assessments = result.rows;

                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            });
        });
    });
});

router.post('/', (req, res, next) => {
    debug(`Responding to post with action ${req.body.__action}`);
    if (req.body.__action == 'add_question') {
        debug(`Responding to action add_question`);

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
            templatePath: path.join(__dirname, '..', '..', 'exampleCourse', 'questions', 'demoCalculation'),
        };

        edit.description = 'Add question in browser and sync';
        edit.write = add_write;
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
        next(error.make(400, 'unknown __action: ' + req.body.__action, {
            locals: res.locals,
            body: req.body,
        }));
    }
});

function add_write(edit, callback) {
    async.waterfall([
        (callback) => {
            debug(`Generate unique QID`);
            fs.readdir(path.join(edit.coursePath, 'questions'), (err, filenames) => {
                let number = 1;

                if (err) {
                    // if the code is ENOENT, then the "questions" folder does
                    // not exist, and so there are no questions yet - otherwise,
                    // something has gone wrong
                    if (err.code != 'ENOENT') return ERR(err, callback);
                } else {
                    filenames.forEach((filename) => {
                        let found = filename.match(/^question-([0-9]+)$/);
                        if (found) {
                            const foundNumber = parseInt(found[1]);
                            if (foundNumber >= number) {
                                number = foundNumber + 1;
                            }
                        }
                    });
                }

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

module.exports = router;
