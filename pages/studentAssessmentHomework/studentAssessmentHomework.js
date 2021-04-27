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
            //if it is a group_work with no instance, jump to a confirm page.
            if (res.locals.assessment.group_work) {
                sqldb.query(sql.get_config_info, params, function(err, result) {
                    if (ERR(err, next)) return;
                    res.locals.permissions = result.rows[0];
                    res.locals.minsize = result.rows[0].minimum || 0;
                    res.locals.maxsize = result.rows[0].maximum || 999;
                    sqldb.query(sql.get_group_info, params, function(err, result) {
                        if (ERR(err, next)) return;
                        res.locals.groupsize = result.rowCount;
                        res.locals.needsize = res.locals.minsize - res.locals.groupsize;
                        if (res.locals.groupsize > 0) {
                            res.locals.group_info = result.rows;
                            res.locals.join_code = res.locals.group_info[0].name + '-' + res.locals.group_info[0].join_code;
                            res.locals.start = false;
                            if (res.locals.needsize <= 0) {
                                res.locals.start = true;
                            }
                        }
                        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                    });
                });
            } else {
                const time_limit_min = null;
                assessment.makeAssessmentInstance(res.locals.assessment.id, res.locals.user.user_id, res.locals.assessment.group_work, res.locals.authn_user.user_id, res.locals.authz_data.mode, time_limit_min, res.locals.authz_data.date, (err, assessment_instance_id) => {
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
    if (req.body.__action == 'new_instance') {
        var params = {
            assessment_id: res.locals.assessment.id,
            user_id: res.locals.user.user_id,
        };
        sqldb.query(sql.find_single_assessment_instance, params, function(err, result) {
            if (ERR(err, next)) return;
            if (result.rowCount == 0) {
                const time_limit_min = null;
                assessment.makeAssessmentInstance(res.locals.assessment.id, res.locals.user.user_id, res.locals.assessment.group_work, res.locals.authn_user.user_id, res.locals.authz_data.mode, time_limit_min, res.locals.authz_data.date, (err, assessment_instance_id) => {
                    if (ERR(err, next)) return;
                    debug('redirecting');
                    res.redirect(res.locals.urlPrefix + '/assessment_instance/' + assessment_instance_id);
                });
            } else {
                debug('redirecting');
                res.redirect(res.locals.urlPrefix + '/assessment_instance/' + result.rows[0].id);
            }
        });
    } else if (req.body.__action == 'join_group') {
        try{
            const group_name = req.body.join_code.split('-')[0];
            const join_code = req.body.join_code.split('-')[1].toUpperCase();
            if (join_code.length != 4) {
                throw 'invalid length of join code';
            }
            let params = [
                res.locals.assessment.id,
                res.locals.user.user_id,
                res.locals.authn_user.user_id,
                group_name,
                join_code,
            ];
            sqldb.call('group_users_insert', params, function(err, _result) {
                if (err) {
                    let params = {
                        assessment_id: res.locals.assessment.id,
                    };        
                    sqldb.query(sql.get_config_info, params, function(err, result) {
                        if (ERR(err, next)) return;
                        res.locals.permissions = result.rows[0];            
                        res.locals.groupsize = 0;
                        //display the error on frontend
                        res.locals.used_join_code = req.body.join_code;
                        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                        return;
                    });
                } else {
                    res.redirect(req.originalUrl);
                }
            });
        } catch (err) {
            // the join code input by user is not valid (not in format of groupname+4-character)
            let params = {
                assessment_id: res.locals.assessment.id,
            };
            sqldb.query(sql.get_config_info, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.permissions = result.rows[0];            
                res.locals.groupsize = 0;
                //display the error on frontend
                res.locals.used_join_code = req.body.join_code;
                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            });
        }
    } else if (req.body.__action == 'create_group') {
        const params = {
            assessment_id: res.locals.assessment.id,
            user_id: res.locals.user.user_id,
            authn_user_id: res.locals.authn_user.user_id,
            group_name: req.body.groupName,
        };
        //alpha and numeric characters only
        let invalidGroupName = true;
        const letters = /^[0-9a-zA-Z]+$/;
        if (req.body.groupName.match(letters)) {
            invalidGroupName = false;
            //try to create a group
            sqldb.query(sql.create_group, params, function(err, _result) {
                if (!err) {
                    res.redirect(req.originalUrl);
                } else {
                    sqldb.query(sql.get_config_info, params, function(err, result) {
                        if (ERR(err, next)) return;
                        res.locals.permissions = result.rows[0];
                        res.locals.groupsize = 0;
                        res.locals.uniqueGroupName = true;
                        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                    });
                }
            });
        }
        if (invalidGroupName) {
            sqldb.query(sql.get_config_info, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.permissions = result.rows[0];
                res.locals.groupsize = 0;
                res.locals.invalidGroupName = true;
                res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            });
        }
    } else if (req.body.__action == 'leave_group') {
        const params = {
            assessment_id: res.locals.assessment.id,
            user_id: res.locals.user.user_id,
            authn_user_id: res.locals.authn_user.user_id,
        };
        sqldb.query(sql.leave_group, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
