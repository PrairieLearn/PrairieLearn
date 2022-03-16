const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const manualGrading = require('../../lib/manualGrading');

router.get(
  '/',
  asyncHandler(async (req, res, _next) => {
    res.redirect(
      await manualGrading.nextUngradedInstanceQuestionUrl(
        res.locals.urlPrefix,
        res.locals.assessment.id,
        res.locals.assessment_question_id,
        res.locals.authz_data.user.user_id,
        null
      )
    );
  })
);

module.exports = router;
