const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const config = require('../../lib/config');
const { sqldb, sqlLoader } = require('@prairielearn/prairielib');
const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    var params = {
        ip: req.ip,
        force_mode: (config.authType == 'none' && req.cookies.pl_requested_mode) ? req.cookies.pl_requested_mode : null,
        req_date: res.locals.req_date,
    };
    sqldb.query(sql.get_mode, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.mode = result.rows[0].mode;
        // We could set res.locals.config.hasOauth = false (or
        // hasAzure) to not display those options inside the CBTF, but
        // this will also need to depend on which institution we have
        // detected (e.g., UIUC doesn't want Azure during exams, but
        // ZJUI does want it).

        sqldb.query(sql.get_course_instances, {}, (err, result) => {
            if (ERR(err, next)) return;
            res.locals.course_instances = result.rows;
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        });
    });
});

module.exports = router;
