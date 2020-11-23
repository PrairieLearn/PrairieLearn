const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const { error, sqlDb, sqlLoader} = require('@prairielearn/prairielib');

const sql = sqlLoader.loadSqlEquiv(__filename);

class NoSubmissionError extends Error {
    constructor(message) {
      super(message);
      this.name = 'NoSubmissionError';
    }
  }

// TODO:
// eslint-disable-next-line no-unused-vars
router.get('/', (req, res, next) => {
    console.log(res.locals);
    const params = {instance_question_id: res.locals.instance_question_id};
    sqlDb.query(sql.instance_question_select_last_variant, params, (err, result) => {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) throw new Error('Instance question not found');
        const variant_id = result.rows[0].id;
        sqlDb.callZeroOrOneRow('variants_select_submission_for_manual_grading', [Number(variant_id), null], (err, result) => {
            if (ERR(err, next)) return;
            if (result.rowCount == 0) return new NoSubmissionError();
            const submission = result.rows[0];
            debug('_gradeVariantWithClient()', 'selected submission', 'submission.id:', submission.id);
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
        });
    });

    debug('GET /');
});

// TODO:
router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    console.log(req.body);
    console.log(req.params);
    return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
});
module.exports = router;