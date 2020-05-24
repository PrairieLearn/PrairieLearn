const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const error = require('@prairielearn/prairielib/error');
const { sqlDb, sqlLoader } = require('@prairielearn/prairielib');

const syncHelpers = require('../shared/syncHelpers');


const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    const params = {course_id: res.locals.course.id};
    sqlDb.query(sql.select_sync_job_sequences, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.job_sequences = result.rows;

        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_course_permission_edit) return next(new Error('Access denied'));
    if (req.body.__action == 'pull') {
        syncHelpers.pullAndUpdate(res.locals, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.__action == 'status') {
        syncHelpers.gitStatus(res.locals, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
