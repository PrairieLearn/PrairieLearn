const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const {sqlDb} = require('@prairielearn/prairielib');

router.get('/', (req, res, next) => {
    const params = [
        res.locals.assessment.id,
        res.locals.assessment_question_id,
        res.locals.authn_user.user_id,
    ];
    // Unmarked instance question df. Is last created submission of instance question AND has null graded_at value.
    sqlDb.callOneRow('instance_questions_update_for_manual_grading', params, (err, result) => {
        if (ERR(err, next)) return;

        // If we have no more instance questions with gradable submissions, then redirect back to manual grading page
        if (!result.rows[0].instance_question) {
            res.redirect(`${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading`);
            return;
        }
        const instance_question_id = result.rows[0].instance_question.id;
        res.redirect(`${res.locals.urlPrefix}/instance_question/${instance_question_id}/manual_grading`);
    });

    debug('GET /');
});

module.exports = router;
