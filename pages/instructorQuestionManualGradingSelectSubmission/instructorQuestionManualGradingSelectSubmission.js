const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const { sqlDb } = require('@prairielearn/prairielib');

router.get('/', (req, res, next) => {
    try {
        const {current, incoming} = JSON.parse(decodeURIComponent(res.locals.diff));
        Object.assign(res.locals, {current, incoming});
    } catch (err) {
        if (ERR(err, next)) return;
    }

    res.locals.grading_user = 1;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);

    debug('GET /');
});


router.post('/', (req, res, next) => {

    const note = req.body.submission_note;
    const score = req.body.submission_score;
    const modifiedAt = req.body.instance_question_modified_at;
    const params = [
        res.locals.instance_question.id,
        res.locals.authn_user.user_id,
        score / 100,
        modifiedAt,
        {manual: note},
    ];
    sqlDb.callZeroOrOneRow('instance_questions_manually_grade_submission', params, err => {
        if (ERR(err, next)) return;

        res.redirect(`${res.locals.urlPrefix}/assessment/${req.body.assessment_id}/assessment_question/${req.body.assessment_question_id}/next_ungraded`);
    debug('POST /');
    });
});

module.exports = router;