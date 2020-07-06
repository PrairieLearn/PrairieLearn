const ERR = require('async-stacktrace');
const express = require('express');
const _ = require('lodash');
const router = express.Router();

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    sqldb.queryOneRow(sql.get_requests, {user_id: res.locals.authn_user.user_id}, (err, result) => {
        if (ERR(err, next)) return;

        _.assign(res.locals, result.rows[0]);
        res.locals.approval_status_get_icon = approval_status_get_icon;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    const short_name = req.body['cr-shortname'] || '';
    const title = req.body['cr-title'] || '';
    const institution = req.body['cr-institution'] || '';
    const sql_params = {
        short_name,
        title,
        institution,
        user_id: res.locals.authn_user.user_id,
    };

    sqldb.query(sql.insert_request, sql_params, (err, _result) => {
        if (ERR(err, next)) return;
        res.redirect(req.originalUrl);
    });
});

module.exports = router;
