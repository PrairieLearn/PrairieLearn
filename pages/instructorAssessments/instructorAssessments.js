const ERR = require('async-stacktrace');
const _ = require('lodash');
const csvStringify = require('../../lib/nonblocking-csv-stringify');
const express = require('express');
const archiver = require('archiver');
const router = express.Router();

const { paginateQuery } = require('../../lib/paginate');
const sanitizeName = require('../../lib/sanitize-name');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const async = require('async');
const error = require('@prairielearn/prairielib/error');
const debug = require('debug')('prairielearn:instructorAssessments');
const fs = require('fs-extra');
const path = require('path');
const uuidv4 = require('uuid/v4');
const logger = require('../../lib/logger');
const editHelpers = require('../shared/editHelpers');

const sql = sqlLoader.loadSqlEquiv(__filename);

const csvFilename = (locals) => {
    return sanitizeName.courseInstanceFilenamePrefix(locals.course_instance, locals.course)
        + 'assessment_stats.csv';
};

const fileSubmissionsName = (locals) => {
    return sanitizeName.courseInstanceFilenamePrefix(locals.course_instance, locals.course)
        + 'file_submissions';
};

const fileSubmissionsFilename = locals => `${fileSubmissionsName(locals)}.zip`;

router.get('/', function(req, res, next) {
    res.locals.csvFilename = csvFilename(res.locals);
    res.locals.fileSubmissionsFilename = fileSubmissionsFilename(res.locals);
    var params = {
        course_instance_id: res.locals.course_instance.id,
        authz_data: res.locals.authz_data,
        req_date: res.locals.req_date,
    };
    sqldb.query(sql.select_assessments, params, function(err, result) {
        if (ERR(err, next)) return;

        res.locals.rows = result.rows;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.get('/:filename', function(req, res, next) {
    if (req.params.filename == csvFilename(res.locals)) {
        var params = {
            course_instance_id: res.locals.course_instance.id,
            authz_data: res.locals.authz_data,
            req_date: res.locals.req_date,
        };
        sqldb.query(sql.select_assessments, params, function(err, result) {
            if (ERR(err, next)) return;
            var assessmentStats = result.rows;
            var csvHeaders = ['Course', 'Instance', 'Set', 'Number', 'Assessment', 'Title', 'AID',
                              'NStudents', 'Mean', 'Std', 'Min', 'Max', 'Median',
                              'NZero', 'NHundred', 'NZeroPerc', 'NHundredPerc',
                              'Hist1', 'Hist2', 'Hist3', 'Hist4', 'Hist5',
                              'Hist6', 'Hist7', 'Hist8', 'Hist9', 'Hist10'];
            var csvData = [];
            _(assessmentStats).each(function(assessmentStat) {
                var csvRow = [
                    res.locals.course.short_name,
                    res.locals.course_instance.short_name,
                    assessmentStat.name,
                    assessmentStat.assessment_number,
                    assessmentStat.label,
                    assessmentStat.title,
                    assessmentStat.tid,
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
                csvRow = csvRow.concat(assessmentStat.score_hist);
                csvData.push(csvRow);
            });
            csvData.splice(0, 0, csvHeaders);
            csvStringify(csvData, function(err, csv) {
                if (err) throw Error('Error formatting CSV', err);
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == fileSubmissionsFilename(res.locals)) {
        const params = {
            course_instance_id: res.locals.course_instance.id,
            limit: 100,
        };

        const archive = archiver('zip');
        const dirname = fileSubmissionsName(res.locals);
        const prefix = `${dirname}/`;
        archive.append(null, { name: prefix });
        res.attachment(req.params.filename);
        archive.pipe(res);
        paginateQuery(sql.course_instance_files, params, (row, callback) => {
            archive.append(row.contents, { name: prefix + row.filename });
            callback(null);
        }, (err) => {
            if (ERR(err, next)) return;
            archive.finalize();
        });
    } else {
        next(new Error('Unknown filename: ' + req.params.filename));
    }
});

router.post('/', (req, res, next) => {
    debug(`Responding to post with action ${req.body.__action}`);
    if (req.body.__action == 'add_assessment') {
        debug(`Responding to action add_assessment`);

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
            courseInstanceID: res.locals.course_instance.id,
            courseInstancePath: path.join(res.locals.course.path, 'courseInstances', res.locals.course_instance.short_name),
            uid: res.locals.user.uid,
            user_name: res.locals.user.name,
        };

        edit.description = 'Add assessment in browser and sync';
        edit.write = add_write;
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
    } else {
        next(error.make(400, 'unknown __action: ' + req.body.__action, {
            locals: res.locals,
            body: req.body,
        }));
    }
});

function add_write(edit, callback) {
    const assessmentsPath = path.join(edit.courseInstancePath, 'assessments');
    async.series([
        (callback) => {
            debug(`Generate unique TID in ${assessmentsPath}`);
            fs.readdir(assessmentsPath, (err, filenames) => {
                if (ERR(err, callback)) return;

                let number = 1;
                filenames.forEach((filename) => {
                    let found = filename.match(/^HW([0-9]+)$/);
                    if (found) {
                        const foundNumber = parseInt(found[1]);
                        if (foundNumber >= number) {
                            number = foundNumber + 1;
                        }
                    }
                });

                edit.tid = `HW${number}`;
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
            debug(`Write infoAssessment.json`);

            // "number" may not be unique - that's ok, the user can change it later -
            // what's important is that "tid" is unique (see above), because that's a
            // directory name
            infoJson = {
                uuid: uuidv4(),
                type: 'Homework',
                title: 'Replace this title',
                set: 'Homework',
                number: `${edit.assessmentNumber}`,
                allowAccess: [],
                zones: [],
            };

            // We use outputJson to create the directory edit.assessmentsPath if it
            // does not exist (which it shouldn't). We use the file system flag 'wx'
            // to throw an error if edit.assessmentPath already exists.
            fs.outputJson(path.join(edit.assessmentPath, 'infoAssessment.json'), infoJson, {spaces: 4, flag: 'wx'}, (err) => {
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
