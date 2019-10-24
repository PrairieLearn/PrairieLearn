var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

const async = require('async');
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const error = require('@prairielearn/prairielib/error');
const fs = require('fs-extra');
const uuidv4 = require('uuid/v4');
const logger = require('../../lib/logger');
const editHelpers = require('../shared/editHelpers');

router.get('/', function(req, res, next) {
    var params = {
        user_id: res.locals.user.user_id,
        is_administrator: res.locals.is_administrator,
        req_date: res.locals.req_date,
        course_id: res.locals.course.id,
    };
    sqldb.query(sql.select_course_instances, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.rows = result.rows;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', (req, res, next) => {
    debug(`Responding to post with action ${req.body.__action}`);
    if (req.body.__action == 'add_instance') {
        debug(`Responding to action add_instance`);

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
        };

        edit.description = 'Add course instance in browser and sync';
        edit.write = add_write;
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
    } else {
        next(error.make(400, 'unknown __action: ' + req.body.__action, {
            locals: res.locals,
            body: req.body,
        }));
    }
});

function getNextNameShort() {
    const today = new Date();
    const month = today.getMonth();
    let nextSeason;
    let nextYear = today.getFullYear() - 2000;
    if (month <= 4) {
        nextSeason = 'Su';
    } else if (month <= 7) {
        nextSeason = 'Fa';
    } else {
        nextSeason = 'Sp';
        nextYear += 1;
    }
    return `${nextSeason}${nextYear.toString().padStart(2, '0')}`;
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

function add_write(edit, callback) {
    const courseInstancesPath = path.join(edit.coursePath, 'courseInstances');
    async.waterfall([
        (callback) => {
            debug(`Generate unique short_name in ${courseInstancesPath}`);
            fs.readdir(courseInstancesPath, (err, filenames) => {
                if (ERR(err, callback)) return;

                // Make some effort to create a sane short_name
                edit.short_name = '';
                if (! edit.short_name) {
                    let short_name = getNextNameShort();
                    if (! filenames.includes(short_name)) {
                        edit.short_name = short_name;
                    }
                }

                // Fall back to courseInstanceX
                if (! edit.short_name) {
                    let number = 1;
                    filenames.forEach((filename) => {
                        let found = filename.match(/^courseInstance([0-9]+)$/);
                        if (found) {
                            const foundNumber = parseInt(found[1]);
                            if (foundNumber >= number) {
                                number = foundNumber + 1;
                            }
                        }
                    });
                    edit.short_name = `courseInstance${number}`;
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
            debug(`Write infoCourseInstance.json`);

            // "number" may not be unique - that's ok, the user can change it later -
            // what's important is that "tid" is unique (see above), because that's a
            // directory name
            let infoJson = {
                uuid: uuidv4(),
                longName: `Replace this long name (${edit.short_name})`,
                userRoles: {},
                allowAccess: [],
            };

            // We use outputJson to create the directory edit.courseInstancePath if it
            // does not exist (which it shouldn't). We use the file system flag 'wx' to
            // throw an error if edit.courseInstancePath already exists.
            fs.outputJson(path.join(edit.courseInstancePath, 'infoCourseInstance.json'), infoJson, {spaces: 4, flag: 'wx'}, (err) => {
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
