const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

function isGradable(instanceQuestion) {
    return !instanceQuestion.graded_at;
}

router.get('/', function(req, res, next) {
    debug('GET /');
    var params = {
        assessment_id: res.locals.assessment.id,
    };
    sqldb.query(sql.select_submissions_manual_grading, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.instance_questions_to_grade = result.rows.filter(isGradable);
        res.locals.instance_questions_graded = result.rows.filter(iq => !isGradable(iq));
        console.log(result.rows);
        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

module.exports = router;
