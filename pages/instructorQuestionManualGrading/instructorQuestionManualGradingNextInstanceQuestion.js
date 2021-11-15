const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const logger = require('../../lib/logger');
const sqlDb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(
  path.join(
    __dirname,
    '..',
    'instructorAssessmentQuestionManualGrading/instructorAssessmentQuestionManualGrading.sql'
  )
);

router.get('/', (req, res, next) => {
  const params = {
    assessment_question_id: res.locals.assessment_question_id,
    assessment_id: res.locals.assessment.id,
  };

  sqlDb.query(sql.select_instance_questions_manual_grading, params, function (err, result) {
    if (ERR(err, next)) return;
    let rows = result.rows.filter((iq) => !iq.graded_at);

    // If we have no more submissions, then redirect back to manual grading page
    if (!rows[0]) {
      logger.info(
        'ManualGradingNextInstanceQuestion: No more submissions, back to manual grading page.'
      );
      res.redirect(
        `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading?done`
      );
      return;
    }

    logger.info(
      'ManualGradingNextInstanceQuestion: Found next submission to grading, redirecting.'
    );
    const instance_question_id = rows[0].id;
    res.redirect(
      `${res.locals.urlPrefix}/instance_question/${instance_question_id}/manual_grading`
    );
  });

  debug('GET /');
});

module.exports = router;
