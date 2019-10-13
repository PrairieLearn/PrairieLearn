const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');
const express = require('express');
const router = express.Router();
const csvStringify = require('../../lib/nonblocking-csv-stringify');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const sanitizeName = require('../../lib/sanitize-name');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

const error = require('@prairielearn/prairielib/error');
const fs = require('fs-extra');
const uuidv4 = require('uuid/v4');
const logger = require('../../lib/logger');
const editHelpers = require('../shared/editHelpers');

const getAssessmentPath = function(coursePath, courseInstanceShortName, assessmentTid) {
    return path.join(coursePath, 'courseInstances', courseInstanceShortName, 'assessments', assessmentTid);
}

router.get('/', function(req, res, next) {
    debug('GET /');
    async.series([
        function(callback) {
            debug('query assessment_stats');
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.queryOneRow(sql.assessment_stats, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.assessment_stat = result.rows[0];
                debug(res.locals.assessment_stat);
                callback(null);
           });
        },
        function(callback) {
            debug('query assessment_duration_stats');
            // NOTE: this aggregates over all instances
            var params = {assessment_id: res.locals.assessment.id};
            sqldb.queryOneRow(sql.assessment_duration_stats, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.duration_stat = result.rows[0];
                debug(res.locals.duration_stat);
                callback(null);
            });
        },
        (callback) => {
            debug('query tids');
            sqldb.queryOneRow(sql.tids, {course_instance_id: res.locals.course_instance.id}, (err, result) => {
                if (ERR(err, callback)) return;
                res.locals.tids = result.rows[0].tids;
                callback(null);
            });
        },
    ], function(err) {
        if (ERR(err, next)) return;
        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    debug('POST /');
    if (req.body.__action == 'copy_assessment') {
        debug('Copy assessment');

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
            templatePath: getAssessmentPath(res.locals.course.path, res.locals.course_instance.short_name, res.locals.assessment.tid),
            courseInstanceID: res.locals.course_instance.id,
            courseInstancePath: path.join(res.locals.course.path, 'courseInstances', res.locals.course_instance.short_name),
            assessmentSetAbbreviation: res.locals.assessment_set.abbreviation,
        };

        edit.description = 'Copy assessment in browser and sync';
        edit.write = copy_write;
        editHelpers.doEdit(edit, res.locals, (err, job_sequence_id) => {
            if (ERR(err, (e) => logger.error(e))) {
                res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
            } else {
                debug(`Get assessment_id from tid=${edit.tid} with course_instance_id=${edit.courseInstanceID}`);
                sqldb.queryOneRow(sql.select_assessment_id_from_tid, {tid: edit.tid, course_instance_id: edit.courseInstanceID}, (err, result) => {
                    if (ERR(err, next)) return;
                    res.redirect(res.locals.urlPrefix + '/assessment/' + result.rows[0].assessment_id);
                });
            }
        });
    } else if (req.body.__action == 'delete_assessment') {
        debug('Delete assessment');

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
            deletePath: getAssessmentPath(res.locals.course.path, res.locals.course_instance.short_name, res.locals.assessment.tid),
            tid: res.locals.assessment.tid,
        };

        edit.description = 'Delete assessment in browser and sync';
        edit.write = delete_write;
        editHelpers.doEdit(edit, res.locals, (err, job_sequence_id) => {
            if (ERR(err, (e) => logger.error(e))) {
                res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
            } else {
                res.redirect(res.locals.urlPrefix + '/assessments');
            }
        });
    } else if (req.body.__action == 'change_id') {
        debug(`Change tid from ${res.locals.assessment.tid} to ${req.body.id}`);
        if (!res.locals.authz_data.has_course_permission_edit) return next(new Error('Access denied'));

        // Do not allow users to edit the exampleCourse
        if (res.locals.course.options.isExampleCourse) {
            return next(error.make(400, `attempting to edit the example course`, {
                locals: res.locals,
                body: req.body,
            }));
        }

        if (res.locals.assessment.tid == req.body.id) {
            debug('The new tid is the same as the old tid - do nothing')
            res.redirect(req.originalUrl);
        } else {
            let edit = {
                userID: res.locals.user.user_id,
                courseID: res.locals.course.id,
                coursePath: res.locals.course.path,
                uid: res.locals.user.uid,
                user_name: res.locals.user.name,
                tid_old: res.locals.assessment.tid,
                tid_new: req.body.id,
                assessment_id: res.locals.assessment.id,
                courseInstanceShortName: res.locals.course_instance.short_name,
            };

            edit.description = 'Change assessment ID in browser and sync';
            edit.write = change_tid_write;
            editHelpers.doEdit(edit, res.locals, (err, job_sequence_id) => {
                if (ERR(err, (e) => logger.error(e))) {
                    res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
                } else {
                    res.redirect(req.originalUrl);
                }
            });
        }
    } else {
        return next(new Error('unknown __action: ' + req.body.__action));
    }
});

function delete_write(edit, callback) {
    debug(`Delete ${edit.deletePath}`);
    // This will silently do nothing if deletePath no longer exists.
    fs.remove(edit.deletePath, (err) => {
        if (ERR(err, callback)) return;
        edit.pathsToAdd = [
            edit.deletePath,
        ];
        edit.commitMessage = `in-browser edit: delete assessment ${edit.tid}`;
        callback(null);
    });
}

function copy_write(edit, callback) {
    const assessmentsPath = path.join(edit.courseInstancePath, 'assessments');
    async.waterfall([
        (callback) => {
            debug(`Generate unique TID in ${assessmentsPath}`);
            fs.readdir(assessmentsPath, (err, filenames) => {
                if (ERR(err, callback)) return;

                let number = 1;
                filenames.forEach((filename) => {
                    const regex = new RegExp(`^${edit.assessmentSetAbbreviation}([0-9]+)$`)
                    let found = filename.match(regex);
                    if (found) {
                        const foundNumber = parseInt(found[1]);
                        if (foundNumber >= number) {
                            number = foundNumber + 1;
                        }
                    }
                });

                edit.tid = `${edit.assessmentSetAbbreviation}${number}`;
                edit.assessmentNumber = number,
                edit.assessmentPath = path.join(assessmentsPath, edit.tid);
                edit.pathsToAdd = [
                    edit.assessmentPath,
                ];
                edit.commitMessage = `in-browser edit: add assessment ${edit.tid}`;
                callback(null);
            });
        },
        (callback) => {
            debug(`Copy template\n from ${edit.templatePath}\n to ${edit.assessmentPath}`);
            fs.copy(edit.templatePath, edit.assessmentPath, {overwrite: false, errorOnExist: true}, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            debug(`Read infoAssessment.json`);
            fs.readJson(path.join(edit.assessmentPath, 'infoAssessment.json'), (err, infoJson) => {
                if (ERR(err, callback)) return;
                callback(null, infoJson);
            });
        },
        (infoJson, callback) => {
            debug(`Write infoAssessment.json with new title, uuid, and number`);
            infoJson.title = 'Replace this title';
            infoJson.uuid = uuidv4();
            infoJson.number = `${edit.assessmentNumber}`;
            fs.writeJson(path.join(edit.assessmentPath, 'infoAssessment.json'), infoJson, {spaces: 4}, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function change_tid_write(edit, callback) {
    const oldPath = getAssessmentPath(edit.coursePath, edit.courseInstanceShortName, edit.tid_old);
    const newPath = getAssessmentPath(edit.coursePath, edit.courseInstanceShortName, edit.tid_new);
    debug(`Move files\n from ${oldPath}\n to ${newPath}`);
    fs.move(oldPath, newPath, {overwrite: false}, (err) => {
        if (ERR(err, callback)) return;
        edit.pathsToAdd = [
            oldPath,
            newPath,
        ];
        edit.commitMessage = `in-browser edit: rename assessment ${edit.tid_old} to ${edit.tid_new}`;
        callback(null);
    });
}

module.exports = router;
