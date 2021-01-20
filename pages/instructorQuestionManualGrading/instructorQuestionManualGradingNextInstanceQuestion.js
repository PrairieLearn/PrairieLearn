const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const {error, sqlDb, sqlLoader} = require('@prairielearn/prairielib');
const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
    const params = {assessment_question_id: res.locals.assessment_question_id};
    // Unmarked instance question df. Is last created submission of instance question AND has null graded_at value.
    sqlDb.queryZeroOrOneRow(sql.get_next_unmarked_instance_question, params, (err, result) => {
        if (ERR(err, next)) return;
        if (!result.rows[0]) return next(error.make('500', 'No unmarked instance questions to load for assessment_question_id: ' + params.assessment_question_id));
        const instance_question_id = result.rows[0].id;
        res.redirect(res.locals.urlPrefix + '/instance_question/' + instance_question_id + '/manual_grading');
    });

    debug('GET /');
});

module.exports = router;