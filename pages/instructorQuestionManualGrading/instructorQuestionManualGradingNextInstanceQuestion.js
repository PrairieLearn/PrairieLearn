const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const sqlDb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
  const params = {
    assessment_id: res.locals.assessment.id,
    assessment_question_id: res.locals.assessment_question_id,
    user_id: res.locals.authz_data.user.user_id,
    prior_instance_question_id: req.query.prior_instance_question,
  };

  sqlDb.queryZeroOrOneRow(
    sql.select_next_ungraded_instance_question,
    params,
    function (err, result) {
      if (ERR(err, next)) return;

      // If we have no more submissions, then redirect back to manual grading page
      if (!result.rows[0]) {
        res.redirect(
          `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/assessment_question/${res.locals.assessment_question_id}/manual_grading`
        );
        return;
      }

      const instance_question_id = result.rows[0].id;
      res.redirect(
        `${res.locals.urlPrefix}/instance_question/${instance_question_id}/manual_grading`
      );
    }
  );

  debug('GET /');
});

module.exports = router;
