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
    const params = {
        assessment_id: res.locals.assessment.id, 
        group_work: res.locals.assessment.group_work,
    };
    sqldb.query(sql.select_assessment_instances, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.user_scores = result.rows;
        res.locals.time_limit_list = new Object();
        res.locals.remaining_time_min = null;
        res.locals.remaining_time_max = null;
        res.locals.has_open_instance = false;
        res.locals.has_closed_instance = false;
        result.rows.forEach(function(row) {
            if (row.time_remaining == 'Unlimited')
                res.locals.has_open_instance = true;
            else if (row.time_remaining == 'Closed')
                res.locals.has_closed_instance = true;
            else {
                if (!(row.total_time_sec in res.locals.time_limit_list))
                    res.locals.time_limit_list[row.total_time_sec] = row.total_time;
                if (res.locals.remaining_time_min === null ||
                    res.locals.remaining_time_min > row.time_remaining_sec)
                    res.locals.remaining_time_min = row.time_remaining_sec;
                if (res.locals.remaining_time_max === null ||
                    res.locals.remaining_time_max < row.time_remaining_sec)
                    res.locals.remaining_time_max = row.time_remaining_sec;
            }
        });
        res.locals.time_limit_list = Object.values(res.locals.time_limit_list);
        res.locals.time_limit_list = res.locals.time_limit_list.length > 0 ? res.locals.time_limit_list.join(', ') : 'No time limits';
        if (res.locals.remaining_time_min === null)
            res.locals.remaining_time_range = 'No time limits';
        else if (res.locals.remaining_time_max < 60)
            res.locals.remaining_time_range = 'Less than a minute';
        else if (res.locals.remaining_time_min < 60)
            res.locals.remaining_time_range = 'up to ' + Math.floor(res.locals.remaining_time_max / 60) + ' min';
        else if (Math.floor(res.locals.remaining_time_min / 60) == Math.floor(res.locals.remaining_time_max / 60))
            res.locals.remaining_time_range = Math.floor(res.locals.remaining_time_min / 60) + ' min';
        else
            res.locals.remaining_time_range = 'between ' + Math.floor(res.locals.remaining_time_min / 60) + ' and ' + Math.floor(res.locals.remaining_time_max / 60) + ' min';
        
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
    } else if (req.body.__action == 'open_all') {
        const assessment_id = res.locals.assessment.id;
        const params = {
            assessment_id,
            authn_user_id: res.locals.authz_data.authn_user.user_id,
        };
        sqldb.query(sql.open_all, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
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
    } else if (req.body.__action == 'set_time_limit') {
        const params = {
            assessment_instance_id: req.body.assessment_instance_id,
            time_add: req.body.time_add * req.body.time_ref,
            base_time: 'date_limit',
            authn_user_id: res.locals.authz_data.authn_user.user_id,
        };
        if (req.body.plus_minus == 'unlimited')
            params.base_time = 'null';
        else if (req.body.plus_minus == 'set_total')
            params.base_time = 'start_date';
        else if (req.body.plus_minus == 'set_rem')
            params.base_time = 'current_date';
        else
            params.time_add *= req.body.plus_minus;
        sqldb.query(sql.set_time_limit, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'set_time_limit_all') {
        const params = {
            assessment_id: res.locals.assessment.id,
            time_add: req.body.time_add * req.body.time_ref,
            base_time: 'date_limit',
            authn_user_id: res.locals.authz_data.authn_user.user_id,
        };
        if (req.body.plus_minus == 'unlimited')
            params.base_time = 'null';
        else if (req.body.plus_minus == 'set_total')
            params.base_time = 'start_date';
        else if (req.body.plus_minus == 'set_rem')
            params.base_time = 'current_date';
        else
            params.time_add *= req.body.plus_minus;
        sqldb.query(sql.set_time_limit_all, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});
module.exports = router;
