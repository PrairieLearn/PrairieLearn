const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const async = require('async');
const error = require('@prairielearn/prairielib/error');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const fs = require('fs-extra');
const uuidv4 = require('uuid/v4');
const logger = require('../../lib/logger');
const editHelpers = require('../shared/editHelpers');
const config = require('../../lib/config');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/:file_transfer_id', function(req, res, next) {
    if (!res.locals.authz_data.has_course_permission_edit) return next(new Error('Access denied'));

    // Do not allow users to edit the exampleCourse
    if (res.locals.course.options.isExampleCourse) {
        return next(error.make(400, `attempting to edit example course`, {
            locals: res.locals,
            body: req.body,
        }));
    }

    if (config.filesRoot == null) return next(new Error('config.filesRoot is null'));

    sqldb.queryOneRow(sql.select_file_transfer, {id: req.params.file_transfer_id}, (err, result) => {
        if (ERR(err, next)) return;
        const file_transfer = result.rows[0];
        if (file_transfer.transfer_type != 'copy_question') return next(new Error(`bad transfer_type: ${file_transfer.transfer_type}`));
        if (file_transfer.user_id != res.locals.user.user_id) return next(new Error(`must have same user_id: ${file_transfer.user_id} and ${res.locals.user.user_id}`));
        let edit = {
            userID: res.locals.user.user_id,
            courseID: res.locals.course.id,
            coursePath: res.locals.course.path,
            uid: res.locals.user.uid,
            user_name: res.locals.user.name,
            templatePath: path.join(config.filesRoot, file_transfer.storage_filename),
            old_qid: path.basename(file_transfer.from_filename),
            description: 'Copy question from a different course in browser and sync',
            write: copy_write,
        };
        editHelpers.doEdit(edit, res.locals, (err, job_sequence_id) => {
            if (ERR(err, (e) => logger.error(e))) {
                res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
            } else {
                debug(`Soft-delete file transfer`);
                sqldb.queryOneRow(sql.soft_delete_file_transfer, {
                    id: req.params.file_transfer_id,
                    user_id: res.locals.user.user_id,
                }, (err, _result) => {
                    if (ERR(err, next)) return;
                    debug(`Get question_id from qid=${edit.qid} with course_id=${edit.courseID}`);
                    sqldb.queryOneRow(sql.select_question_id_from_qid, {qid: edit.qid, course_id: edit.courseID}, function(err, result) {
                        if (ERR(err, next)) return;
                        res.redirect(res.locals.urlPrefix + '/question/' + result.rows[0].question_id);
                    });
                });
            }
        });
    });
});

function copy_write(edit, callback) {
    async.waterfall([
        (callback) => {
            debug(`Generate unique QID`);
            fs.readdir(path.join(edit.coursePath, 'questions'), (err, filenames) => {
                if (ERR(err, callback)) return;

                if (filenames.includes(edit.old_qid)) {
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
                } else {
                    edit.qid = edit.old_qid;
                }

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
