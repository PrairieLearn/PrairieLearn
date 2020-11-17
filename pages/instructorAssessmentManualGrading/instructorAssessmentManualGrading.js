const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const {error, sqlDb, sqlLoader} = require('@prairielearn/prairielib');

const sql = sqlLoader.loadSqlEquiv(__filename);


const sanitizeName = require('../../lib/sanitize-name');

const logCsvFilename = (locals) => {
    return sanitizeName.assessmentFilenamePrefix(locals.assessment, locals.assessment_set, locals.course_instance, locals.course)
        + sanitizeName.sanitizeString(locals.assessment.group_work ? locals.group.name : locals.instance_user.uid)
        + '_'
        + locals.assessment_instance.number
        + '_'
        + 'log.csv';
};

// TODO:
// eslint-disable-next-line no-unused-vars
router.get('/', (req, res, next) => {
    res.locals.logCsvFilename = logCsvFilename(res.locals);
    if (!res.locals.authz_data.has_instructor_edit) return next();
    
    const params = {assessment_instance_id: res.locals.assessment_instance.id};
    sqlDb.query(sql.assessment_instance_stats, params, (err, result) => {
        if (ERR(err, next)) return;
        res.locals.assessment_instance_stats = result.rows;

        sqlDb.queryOneRow(sql.select_date_formatted_duration, params, (err, result) => {
            if (ERR(err, next)) return;
            res.locals.assessment_instance_date_formatted = result.rows[0].assessment_instance_date_formatted;
            res.locals.assessment_instance_duration = result.rows[0].assessment_instance_duration;

            const params = {assessment_instance_id: res.locals.assessment_instance.id};
            sqlDb.query(sql.select_instance_questions, params, (err, result) => {
                if (ERR(err, next)) return;
                res.locals.instance_questions = result.rows;

                const params = [res.locals.assessment_instance.id];
                sqlDb.call('assessment_instances_select_log', params, (err, result) => {
                    if (ERR(err, next)) return;
                    res.locals.log = result.rows;
                    if (res.locals.assessment.group_work) {
                        const params = {assessment_instance_id: res.locals.assessment_instance.id};
                        sqlDb.query(sql.select_group_info, params, (err, result) => {
                            if (ERR(err, next)) return;
                            res.locals.group = result.rows[0];
                            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                        });
                    } else {
                        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                    }
                });
            });
        });
    });
    debug('GET /');
});

// TODO:
router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
});
module.exports = router;
