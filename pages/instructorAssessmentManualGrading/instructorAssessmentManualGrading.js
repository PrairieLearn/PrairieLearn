const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const { sqlDb, sqlLoader} = require('@prairielearn/prairielib');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', function(req, res, next) {
    debug('GET /');
    var params = {
        assessment_id: res.locals.assessment.id,
    };
    sqlDb.query(sql.select_questions_manual_grading, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.questions = result.rows;
        debug('render page');
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', function(req, res, next) {
    const params = {
        'assessment_id': res.locals.assessment.id,
        'assessment_question_id': res.locals.assessment_question_id,
    };
    sqlDb.query(sql.unlock_locked_instance_questions, params, (err) => {
        if (ERR(err, next)) return;

        res.redirect(`${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading`);
    });

});

module.exports = router;
