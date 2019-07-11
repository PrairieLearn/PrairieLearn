const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const error = require('@prairielearn/prairielib/error');
const regrading = require('../../lib/regrading');
const assessment = require('../../lib/assessment');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    debug('GET /');
    const params = {assessment_id: res.locals.assessment.id};
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
        const assessment_id = res.locals.assessment.id;
        const assessment_instance_id = req.body.assessment_instance_id;
        assessment.checkBelongs(assessment_instance_id, assessment_id, (err) => {
            if (ERR(err, next)) return;
            
            const params = {
                assessment_id,
                assessment_instance_id,
                authn_user_id: res.locals.authz_data.authn_user.user_id,
            };
            sqldb.queryOneRow(sql.open, params, function(err, _result) {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        });
    } else if (req.body.__action == 'close') {
        const assessment_id = res.locals.assessment.id;
        const assessment_instance_id = req.body.assessment_instance_id;
        assessment.checkBelongs(assessment_instance_id, assessment_id, (err) => {
            if (ERR(err, next)) return;
            
            const close = true;
            assessment.gradeAssessmentInstance(assessment_instance_id, res.locals.authn_user.user_id, close, function(err) {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        });
    } else if (req.body.__action == 'delete') {
        const assessment_id = res.locals.assessment.id;
        const assessment_instance_id = req.body.assessment_instance_id;
        assessment.checkBelongs(assessment_instance_id, assessment_id, (err) => {
            if (ERR(err, next)) return;
            
            const params = [
                assessment_instance_id,
                res.locals.authn_user.user_id,
            ];
            sqldb.call('assessment_instances_delete', params, function(err, _result) {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        });
    } else if (req.body.__action == 'delete_all') {
        const params = [
            res.locals.assessment.id,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('assessment_instances_delete_all', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'regrade') {
        const assessment_id = res.locals.assessment.id;
        const assessment_instance_id = req.body.assessment_instance_id;
        assessment.checkBelongs(assessment_instance_id, assessment_id, (err) => {
            if (ERR(err, next)) return;
            
            regrading.regradeAssessmentInstance(assessment_instance_id, res.locals.user.user_id, res.locals.authn_user.id, function(err, job_sequence_id) {
                if (ERR(err, next)) return;
                res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
            });
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});
module.exports = router;
