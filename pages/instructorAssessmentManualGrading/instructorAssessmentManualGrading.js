const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const config = require('../../lib/config');
const {sqlDb, sqlLoader} = require('@prairielearn/prairielib');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    debug('GET /');
    var params = {
        assessment_id: res.locals.assessment.id,
        manual_grading_expiry_sec: `${config.manualGradingExpirySec} seconds`,
    };
    sqlDb.query(sql.select_questions_manual_grading, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.questions = result.rows;
        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
