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
                    sqldb.query(sql.get_group_info, params, function(err, result) {
                        if (ERR(err, next)) return;
                        res.locals.groupsize = result.rowCount;
                        if (res.locals.groupsize > 0) {
                            res.locals.groupinfo = result.rows;
                            const group_id = res.locals.groupinfo[0].group_id || 0;
                            res.locals.friendcode = Buffer.from(group_id, 'utf-8').toString('base64');
                            res.locals.minsize = result.rows[0].minimum || 0;
                            res.locals.maxsize = result.rows[0].maximum || 999;
                            res.locals.needsize = res.locals.minsize - res.locals.groupsize;
                            res.locals.start = false;
                            if (res.locals.needsize <= 0) {
                                res.locals.start = true;
                            }
                            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                        } else {
                            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                        }
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
    if (req.body.__action == 'newInstance') {
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
    } else if (req.body.__action == 'joinGroup') {
        const friendcode = req.body.friendcode;
        const group_id = Buffer.from(friendcode, 'base64').toString('utf8');
        const params = {
            assessment_id: res.locals.assessment.id,
            group_id,
            user_id: res.locals.user.user_id,
        };
        let cursize, maxsize;
        sqldb.query(sql.get_config_info, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.permissions = result.rows[0];
            sqldb.query(sql.check_group_size, params, function(err, result) {
                let joinerror = true;
                //students may have invalid input here, no need to log the error information
                if (!ERR(err, next)){
                    if (typeof result !== 'undefined'){
                        cursize = result.rowCount || 0;
                        if (cursize > 0) {
                            maxsize = result.rows[0].maximum;
                            if (cursize < maxsize) {
                                //sucessfully join into a exist and not full group
                                joinerror = false;
                                sqldb.query(sql.join_group, params, function(err, _result) {
                                    if (ERR(err, next)) return;
                                    res.redirect(req.originalUrl);
                                });
                            }
                        }
                    }
                }
                if (joinerror){
                    res.locals.groupsize = 0;
                    //display the error on frontend
                    res.locals.usedfriendcode = friendcode;
                    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                }
            });
        });
    } else if (req.body.__action == 'createGroup') {
        const params = {
            assessment_id: res.locals.assessment.id,
            user_id: res.locals.user.user_id,
            group_name: req.body.groupName + ' #' + Math.round((Date.now() / 1000) % 100000),
        };
        sqldb.query(sql.create_group, params, function(err, _result) {
            if (ERR(err, next)) return;
            sqldb.query(sql.join_justcreated_group, params, function(err, _result) {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        });
    } else if (req.body.__action == 'quitGroup') {
        var params2 = {
            assessment_id: res.locals.assessment.id,
            user_id: res.locals.user.user_id,
        };
        sqldb.query(sql.quit_group, params2, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
