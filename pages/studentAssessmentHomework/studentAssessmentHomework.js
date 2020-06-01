var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();
var path = require('path');
var debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

var error = require('@prairielearn/prairielib/error');
var assessment = require('../../lib/assessment');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    debug('GET');
    if (res.locals.assessment.type !== 'Homework') return next();
    debug('is Homework');
    if (res.locals.assessment.multiple_instance) {
        return next(error.makeWithData('"Homework" assessments do not support multiple instances',
                                       {assessment: res.locals.assessment}));
    }

    debug('fetching assessment_instance');
    var params = {
        assessment_id: res.locals.assessment.id,
        user_id: res.locals.user.user_id,
    };

    sqldb.query(sql.find_single_assessment_instance, params, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) {
            debug('no assessment instance');
            //if it is a groupwork with no instance, jump to a confirm page.
            if(res.locals.assessment.groupwork){
                if (ERR(err, next)) return;
                sqldb.query(sql.get_groupinfo, params, function(err, result) {
                    if (ERR(err, next)) return;
                    res.locals.groupsize = result.rowCount;
                    if(res.locals.groupsize > 0){
                        res.locals.groupinfo = result.rows;
                        const group_id = res.locals.groupinfo[0].group_id || 0;
                        res.locals.friendcode = Buffer.from(group_id, 'utf-8').toString('base64');
                        sqldb.query(sql.config_info, params, function(err, result) {
                            if (ERR(err, next)) return;
                            res.locals.minsize = result.rows[0].minimum;
                            res.locals.needsize = res.locals.minsize - res.locals.groupsize;
                            res.locals.start = false;
                            if(res.locals.needsize <= 0){
                                res.locals.start = true;
                            }
                            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                        });
                    } else {
                        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                    }
                });
            } else {
                const time_limit_min = null;
                assessment.makeAssessmentInstance(res.locals.assessment.id, res.locals.user.user_id, res.locals.assessment.groupwork, res.locals.authn_user.user_id, res.locals.authz_data.mode, time_limit_min, res.locals.authz_data.date, (err, assessment_instance_id) => {
                    if (ERR(err, next)) return;
                    debug('redirecting');
                    res.redirect(res.locals.urlPrefix + '/assessment_instance/' + assessment_instance_id);
                });    
            }
        } else {
            debug('redirecting');
            res.redirect(res.locals.urlPrefix + '/assessment_instance/' + result.rows[0].id);
        }
    });
});

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Homework') return next();
    if (req.body.__action == 'newInstance') {
        const time_limit_min = null;
            assessment.makeAssessmentInstance(res.locals.assessment.id, res.locals.user.user_id, res.locals.assessment.groupwork, res.locals.authn_user.user_id, res.locals.authz_data.mode, time_limit_min, res.locals.authz_data.date, (err, assessment_instance_id) => {
                if (ERR(err, next)) return;
                debug('redirecting');
                res.redirect(res.locals.urlPrefix + '/assessment_instance/' + assessment_instance_id);
            });
    } else if(req.body.__action == 'joinGroup'){
        const group_id = Buffer.from(req.body.friendcode, 'base64').toString('utf8');
        const params = {
            group_id,
            user_id: res.locals.user.user_id,
        };
        sqldb.query(sql.join_group, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if(req.body.__action == 'createGroup'){
        const params = {
            assessment_id: res.locals.assessment.id,
            user_id: res.locals.user.user_id,
            group_name: req.body.groupName,
        };
        sqldb.query(sql.create_group, params, function(err, _result) {
            if (ERR(err, next)) return;
            sqldb.query(sql.join_justcreated_group, params, function(err, _result) {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        });
    } else if (req.body.__action == 'quitGroup') {
        var params = {
            assessment_id: res.locals.assessment.id,
            user_id: res.locals.user.user_id,
        };
        sqldb.query(sql.quit_group, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.locals.groupsize = 0;
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
