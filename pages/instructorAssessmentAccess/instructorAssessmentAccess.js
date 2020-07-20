const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const config = require('../../lib/config');
const error = require('@prairielearn/prairielib/error');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    debug('GET /');
    const params = {
        assessment_id: res.locals.assessment.id,
        link_exam_id: config.syncExamIdAccessRules,
    };
    sqldb.query(sql.assessment_access_rules, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.access_rules = result.rows;
        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    const params = {
        assessment_id: res.locals.assessment.id,
        access_rule_number: req.body.access_rule_number,
    };
    if (req.body.__action == 'increase_aar_time_limit') {
        sqldb.query(sql.increase_aar_time_limit, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'decrease_aar_time_limit') {
        sqldb.query(sql.decrease_aar_time_limit, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown __action', {body: req.body, locals: res.locals}));
    }
});

module.exports = router;
