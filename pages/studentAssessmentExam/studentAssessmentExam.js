var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var error = require('@prairielearn/prairielib/error');
var assessment = require('../../lib/assessment');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    res.locals.start = true;
    if (res.locals.assessment.multiple_instance) {
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    } else {
        var params = {
            assessment_id: res.locals.assessment.id,
            user_id: res.locals.user.user_id,
        };
        sqldb.query(sql.find_single_assessment_instance, params, function(err, result) {
            if (ERR(err, next)) return;
            if (result.rowCount == 0) {
                if(res.locals.assessment.group_work){
                    sqldb.query(sql.get_group_info, params, function(err, result) {
                        if (ERR(err, next)) return;
                        if(result.rowCount == 0){
                            res.locals.start = false;
                        }
                        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                    });
                }
            } else {
                res.redirect(res.locals.urlPrefix + '/assessment_instance/' + result.rows[0].id);
            }
        });
    }
});

router.post('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    if (!res.locals.authz_result.authorized_edit) return next(error.make(403, 'Not authorized', res.locals));
    if (req.body.__action == 'newInstance') {
        var params = {
            assessment_id: res.locals.assessment.id,
            user_id: res.locals.user.user_id,
        };
        sqldb.query(sql.find_single_assessment_instance, params, function(err, result) {
            if (ERR(err, next)) return;
            if (result.rowCount == 0) {
                assessment.makeAssessmentInstance(res.locals.assessment.id, res.locals.user.user_id, res.locals.assessment.group_work, res.locals.authn_user.user_id, res.locals.authz_data.mode,  res.locals.authz_result.time_limit_min, res.locals.req_date, (err, assessment_instance_id) => {
                    if (ERR(err, next)) return;
                    res.redirect(res.locals.urlPrefix + '/assessment_instance/' + assessment_instance_id);
                });
            } else {
                res.redirect(res.locals.urlPrefix + '/assessment_instance/' + result.rows[0].id);
            }
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
