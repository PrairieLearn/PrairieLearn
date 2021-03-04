const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const async = require('async');
const question = require('../../lib/question');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const { error, sqlDb } = require('@prairielearn/prairielib');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
    const {current, incoming} = res.locals.diff;
    Object.assign(res.locals, {current, incoming});

    // res.locals.instance_question = result.rows[0].instance_question;
    // res.locals.question = result.rows[0].question;
    // res.locals.variant = result.rows[0].variant;
    // res.locals.submission = res.locals.diff.current;
    res.locals.grading_user = 1;
    // res.locals.score_perc = res.locals.diff.current.score * 100;
    // sqlDb.callZeroOrOneRow('instance_questions_select_manual_grading_objects', params, (err, result) => {
    //     if (ERR(err, next)) return;

    //     // Instance question doesn't exist (redirect to config page)
    //     if (result.rowCount == 0) {
    //         return callback(error.make(404, 'Instance question not found.', {locals: res.locals, body: req.body}));
    //     }

    //     /**
    //      * Student never loaded question (variant and submission is null)
    //      * Student loaded question but did not submit anything (submission is null)
    //      */
    //     if (!result.rows[0].variant || !result.rows[0].submission) {
    //         return callback(error.make(404, 'No gradable submissions found.', {locals: res.locals, body: req.body}));
    //     }

    //     res.locals.instance_question = result.rows[0].instance_question;
    //     res.locals.question = result.rows[0].question;
    //     res.locals.variant = result.rows[0].variant;
    //     res.locals.submission = result.rows[0].submission;
    //     res.locals.grading_user = result.rows[0].grading_user;
    //     res.locals.score_perc = res.locals.submission.score * 100;
    // });
    // if (ERR(err, next)) return;   
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);

    debug('GET /');
});

module.exports = router;

