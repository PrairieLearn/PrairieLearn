const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const error = require('@prairielearn/prairielib/error');
const regrading = require('../../lib/regrading');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    debug('GET /');
    if (!res.locals.authz_data.has_course_instance_permission_view) return next(new Error('Access denied (must be a student data viewer)'));
    var params = {
        assessment_id: res.locals.assessment.id,
    };
    sqldb.query(sql.select_regrading_job_sequences, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.regrading_job_sequences = result.rows;
        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_course_instance_permission_edit) return next(new Error('Access denied (must be a student data editor)'));
    if (req.body.__action == 'regrade_all') {
        regrading.regradeAllAssessmentInstances(res.locals.assessment.id, res.locals.user.user_id, res.locals.authn_user.id, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});
module.exports = router;
