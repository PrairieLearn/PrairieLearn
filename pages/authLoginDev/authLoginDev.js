const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const authLib = require('../../lib/auth');
const csrf = require('../../lib/csrf');
const config = require('../../lib/config');
const { sqldb, sqlLoader, error } = require('@prairielearn/prairielib');
const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    if (!res.locals.devMode) return next(new Error('DevMode login is not enabled'));

    authLib.devmodeLogin(req, res, (err) => {
        if (ERR(err, next)) return;
        var redirUrl = res.locals.homeUrl;
        if ('preAuthUrl' in req.cookies) {
            redirUrl = req.cookies.preAuthUrl;
            res.clearCookie('preAuthUrl');
        }
        res.redirect(redirUrl);
    });
});

router.post('/', function(req, res, next) {
    if (!res.locals.devMode) return next(new Error('DevMode login is not enabled'));

    let course_instance_id = req.body.course_instance_id ? req.body.course_instance_id : 1;
    var params = [
        'devMode-LTI-user',
        'devMode-LTI-user',
        course_instance_id,
        'devMode-LTI-user',
        'devMode-contextId',
    ];

    sqldb.call('users_select_or_insert_lti', params, (err, result) => {
        if (ERR(err, next)) return;
        var tokenData = {
            user_id: result.rows[0].user_id,
            authn_provider_name: 'LTI',
        };
        var pl_authn = csrf.generateToken(tokenData, config.secretKey);
        res.cookie('pl_authn', pl_authn, {maxAge: 24 * 60 * 60 * 1000});

        var params = {
            course_instance_id: course_instance_id,
            user_id: tokenData.user_id,
            req_date: res.locals.req_date,
            role: req.body.role ? req.body.role : 'Student',
        };

        sqldb.queryZeroOrOneRow(sql.enroll, params, function(err, result) {
            if (ERR(err, next)) return;
            if (result.rowCount == 0) return next(error.make(403, 'Access denied'));

            res.redirect(`${res.locals.urlPrefix}/course_instance/${course_instance_id}`);
        });
    });
});

module.exports = router;
