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

            // No, you do not need to verify authz_result.authorized_edit (indeed, this flag exists
            // only for an assessment instance, not an assessment).
            //
            // The assessment that is created here will be owned by the effective user. The only
            // reason to worry, therefore, is if the effective user has a different UID than the
            // authn user. This is only allowed, however, if the authn user has permission to edit
            // student data in the course instance (which has already been checked), exactly the
            // permission required to create an assessment for the effective user.

            const time_limit_min = null;
            assessment.makeAssessmentInstance(res.locals.assessment.id, res.locals.user.user_id, res.locals.authn_user.user_id, res.locals.authz_data.mode, time_limit_min, res.locals.authz_data.date, (err, assessment_instance_id) => {
                if (ERR(err, next)) return;
                debug('redirecting');
                res.redirect(res.locals.urlPrefix + '/assessment_instance/' + assessment_instance_id);
            });
        } else {
            debug('redirecting');
            res.redirect(res.locals.urlPrefix + '/assessment_instance/' + result.rows[0].id);
        }
    });
});

module.exports = router;
