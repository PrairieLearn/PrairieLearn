const ERR = require('async-stacktrace');
const _ = require('lodash');
const async = require('async');
const csvStringify = require('csv').stringify;
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const archiver = require('archiver');

const error = require('@prairielearn/prairielib/error');
const logger = require('../../lib/logger');
const config = require('../../lib/config');
const serverJobs = require('../../lib/server-jobs');
const csvMaker = require('../../lib/csv-maker');
const { paginateQuery } = require('../../lib/paginate');
const assessment = require('../../lib/assessment');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    debug('GET /');
    var params = {assessment_id: res.locals.assessment.id};
    sqldb.query(sql.select_assessment_instances, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.user_scores = result.rows;
        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    if (req.body.__action == 'open') {
        let params = {
            assessment_id: res.locals.assessment.id,
            assessment_instance_id: req.body.assessment_instance_id,
            authn_user_id: res.locals.authz_data.authn_user.user_id,
        };
        sqldb.queryOneRow(sql.open, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'close') {
        var close = true;
        assessment.gradeAssessmentInstance(req.body.assessment_instance_id, res.locals.authn_user.user_id, close, function(err) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'delete') {
        let params = [
            req.body.assessment_instance_id,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('assessment_instances_delete', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'delete_all') {
        let params = [
            req.body.assessment_id,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('assessment_instances_delete_all', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'regrade') {
        regrading.regradeAssessmentInstance(req.body.assessment_instance_id, res.locals.assessment.id, res.locals.user.user_id, res.locals.authn_user.id, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});
module.exports = router;
