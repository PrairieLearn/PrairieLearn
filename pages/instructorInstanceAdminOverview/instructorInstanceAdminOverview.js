const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const sqldb = require('@prairielearn/prairielib').sqldb;
const sqlLoader = require('@prairielearn/prairielib').sqlLoader;

const sql = sqlLoader.loadSqlEquiv(__filename);

const async = require('async');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('@prairielearn/prairielib/error');
const fs = require('fs-extra');
const uuidv4 = require('uuid/v4');
const logger = require('../../lib/logger');
const editHelpers = require('../shared/editHelpers');

router.get('/', function(req, res, next) {
    debug(res.locals);
    debug('GET /');
    async.series([
        function(callback) {
            debug('query course_instance_stat');
            var params = {course_instance_id: res.locals.course_instance.id};
            sqldb.queryOneRow(sql.course_instance_stat, params, function(err, result) {
                if (ERR(err, callback)) return;
                res.locals.course_instance_stat = result.rows[0];
                debug(res.locals.course_instance_stat);
                callback(null);
            });
        },
        (callback) => {
            debug('query short_names');
            sqldb.queryOneRow(sql.short_names, {course_id: res.locals.course.id}, (err, result) => {
                if (ERR(err, callback)) return;
                res.locals.short_names = result.rows[0].short_names;
                callback(null);
            });
        },
        (callback) => {
            editHelpers.getFiles({
                courseDir: res.locals.course.path,
                baseDir: path.join(res.locals.course.path, 'courseInstances', res.locals.course_instance.short_name),
                clientFilesDir: 'clientFilesCourseInstance',
                serverFilesDir: 'serverFilesCourseInstance',
                ignoreDirs: ['assessments'],
            }, (err, files) => {
                if (ERR(err, callback)) return;
                debug(files);
                res.locals.files = files;
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
    if (req.body.__action == 'copy_course_instance') {
        debug('Copy course instance');

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
            templatePath: path.join(res.locals.course.path, 'courseInstances', res.locals.course_instance.short_name),
            short_name_old: res.locals.course_instance.short_name,
        };

        edit.description = 'Copy course instance in browser and sync';
        edit.write = copy_write;
        editHelpers.doEdit(edit, res.locals, (err, job_sequence_id) => {
            if (ERR(err, (e) => logger.error(e))) {
                res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
            } else {
                debug(`Get course_instance_id from short_name=${edit.short_name} with course_id=${edit.courseID}`);
                sqldb.queryOneRow(sql.select_course_instance_id_from_short_name, {short_name: edit.short_name, course_id: edit.courseID}, (err, result) => {
                    if (ERR(err, next)) return;
                    res.redirect(res.locals.plainUrlPrefix + '/course_instance/' + result.rows[0].course_instance_id + '/instructor/instance_admin');
                });
            }
        });
    } else if (req.body.__action == 'delete_course_instance') {
        debug('Delete course instance');

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
            deletePath: path.join(res.locals.course.path, 'courseInstances', res.locals.course_instance.short_name),
            short_name: res.locals.course_instance.short_name,
        };

        edit.description = 'Delete course instance in browser and sync';
        edit.write = delete_write;
        editHelpers.doEdit(edit, res.locals, (err, job_sequence_id) => {
            if (ERR(err, (e) => logger.error(e))) {
                res.redirect(res.locals.urlPrefix + '/edit_error/' + job_sequence_id);
            } else {
                res.redirect(`${res.locals.plainUrlPrefix}/course/${res.locals.course.id}/course_admin`);
            }
        });
    } else if (req.body.__action == 'change_id') {
        debug(`Change short_name from ${res.locals.course_instance.short_name} to ${req.body.id}`);
        if (!res.locals.authz_data.has_course_permission_edit) return next(new Error('Access denied'));

        // Do not allow users to edit the exampleCourse
        if (res.locals.course.options.isExampleCourse) {
            return next(error.make(400, `attempting to edit the example course`, {
                locals: res.locals,
                body: req.body,
            }));
        }

        if (res.locals.course_instance.short_name == req.body.id) {
            debug('The new short_name is the same as the old short_name - do nothing');
            res.redirect(req.originalUrl);
        } else {
            let edit = {
                userID: res.locals.user.user_id,
                courseID: res.locals.course.id,
                coursePath: res.locals.course.path,
                uid: res.locals.user.uid,
                user_name: res.locals.user.name,
                short_name_old: res.locals.course_instance.short_name,
                short_name_new: req.body.id,
                course_instance_id: res.locals.course_instance.id,
            };

            edit.description = 'Change course instance ID in browser and sync';
            edit.write = change_ciid_write;
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
        edit.commitMessage = `in-browser edit: delete course instance ${edit.short_name}`;
        callback(null);
    });
}

function getNextNameShort(name) {
    let found = name.match(new RegExp(`^([A-Za-z]{2})([0-9]{2})$`));
    debug(`getNextNameShort:\n${found}`);
    if (found) {
        const seasons = ['Sp', 'Su', 'Fa'];
        for (let i = 0; i < 3; i++) {
            if (found[1] == seasons[i]) {
                if (i == 2) return `${seasons[0]}${(parseInt(found[2]) + 1).toString().padStart(2, '0')}`;
                else return `${seasons[i + 1]}${parseInt(found[2]).toString().padStart(2, '0')}`;
            }
        }
    }
    return '';
}

function getNextNameLong(name) {
    let found = name.match(new RegExp(`^([A-Za-z]+)([0-9]{4})$`));
    debug(`getNextNameLong:\n${found}`);
    if (found) {
        const seasons = ['Spring', 'Summer', 'Fall'];
        for (let i = 0; i < 3; i++) {
            if (found[1] == seasons[i]) {
                if (i == 2) return `${seasons[0]}${(parseInt(found[2]) + 1).toString().padStart(2, '0')}`;
                else return `${seasons[i + 1]}${parseInt(found[2]).toString().padStart(2, '0')}`;
            }
        }
    }
    return '';
}

function getPrefixAndNumber(name) {
    let found = name.match(new RegExp('^(?<prefix>.*)_copy(?<number>[0-9]+)$'));
    debug(`getPrefixAndNumber:\n${found}`);
    if (found) {
        return {
            'prefix': found.groups.prefix,
            'number': parseInt(found.groups.number),
        };
    } else {
        return null;
    }
}

function copy_write(edit, callback) {
    const courseInstancesPath = path.join(edit.coursePath, 'courseInstances');
    async.waterfall([
        (callback) => {
            debug(`Generate unique short_name in ${courseInstancesPath}`);
            fs.readdir(courseInstancesPath, (err, filenames) => {
                if (ERR(err, callback)) return;

                // Make some effort to create the next sane short_name
                edit.short_name = '';
                if (! edit.short_name) {
                    let short_name = getNextNameShort(edit.short_name_old);
                    if (! filenames.includes(short_name)) {
                        edit.short_name = short_name;
                    }
                }
                if (! edit.short_name) {
                    let short_name = getNextNameLong(edit.short_name_old);
                    if (! filenames.includes(short_name)) {
                        edit.short_name = short_name;
                    }
                }

                // Fall back to <name>_copyXX
                if (! edit.short_name) {
                    // Make some effort to avoid <name>_copy1_copy1_...
                    let prefix;
                    let number;
                    let prefixAndNumber = getPrefixAndNumber(edit.short_name_old);
                    if (prefixAndNumber) {
                        prefix = prefixAndNumber.prefix;
                        number = prefixAndNumber.number + 1;
                    } else {
                        prefix = edit.short_name_old;
                        number = 1;
                    }
                    filenames.forEach((filename) => {
                        let found = filename.match(new RegExp(`^${prefix}_copy([0-9]+)$`));
                        if (found) {
                            const foundNumber = parseInt(found[1]);
                            if (foundNumber >= number) {
                                number = foundNumber + 1;
                            }
                        }
                    });
                    edit.short_name = `${prefix}_copy${number}`;
                }

                edit.courseInstancePath = path.join(courseInstancesPath, edit.short_name);
                edit.pathsToAdd = [
                    edit.courseInstancePath,
                ];
                edit.commitMessage = `in-browser edit: add course instance ${edit.short_name}`;
                callback(null);
            });
        },
        (callback) => {
            debug(`Copy template\n from ${edit.templatePath}\n to ${edit.courseInstancePath}`);
            fs.copy(edit.templatePath, edit.courseInstancePath, {overwrite: false, errorOnExist: true}, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
        (callback) => {
            debug(`Read infoCourseInstance.json`);
            fs.readJson(path.join(edit.courseInstancePath, 'infoCourseInstance.json'), (err, infoJson) => {
                if (ERR(err, callback)) return;
                callback(null, infoJson);
            });
        },
        (infoJson, callback) => {
            debug(`Write infoCourseInstance.json with new title, uuid, and number`);
            infoJson.longName = `Replace this long name (${edit.short_name})`;
            infoJson.uuid = uuidv4();
            fs.writeJson(path.join(edit.courseInstancePath, 'infoCourseInstance.json'), infoJson, {spaces: 4}, (err) => {
                if (ERR(err, callback)) return;
                callback(null);
            });
        },
    ], (err) => {
        if (ERR(err, callback)) return;
        callback(null);
    });
}

function change_ciid_write(edit, callback) {
    const courseInstancesPath = path.join(edit.coursePath, 'courseInstances');
    const oldPath = path.join(courseInstancesPath, edit.short_name_old);
    const newPath = path.join(courseInstancesPath, edit.short_name_new);
    debug(`Move files\n from ${oldPath}\n to ${newPath}`);
    fs.move(oldPath, newPath, {overwrite: false}, (err) => {
        if (ERR(err, callback)) return;
        edit.pathsToAdd = [
            oldPath,
            newPath,
        ];
        edit.commitMessage = `in-browser edit: rename course instance ${edit.short_name_old} to ${edit.short_name_new}`;
        callback(null);
    });
}

module.exports = router;
