import asyncHandler from 'express-async-handler';

import { IdSchema } from '@prairielearn/zod';

import { loadAssessmentQuestionContext } from '../lib/assessment-question-context.js';

/**
 * Middleware that checks for an `assessment_question_id` query parameter and,
 * if present, loads the assessment question context onto `res.locals`. This
 * populates the same fields that `selectAndAuthzAssessmentQuestion` and
 * `selectAndAuthzAssessment` would set (assessment_question, assessment,
 * assessment_set, assessment_label, number_in_alternative_group).
 *
 * Intended for use in the question route middleware chain so that question
 * pages can optionally display assessment context without needing a separate URL.
 */
export default asyncHandler(async (req, res, next) => {
  if (req.query.assessment_question_id && res.locals.course_instance) {
    const assessmentQuestionId = IdSchema.parse(req.query.assessment_question_id);
    const context = await loadAssessmentQuestionContext(
      assessmentQuestionId,
      res.locals.question.id,
      res.locals.course_instance.id,
    );
    if (context) {
      Object.assign(res.locals, context);
    }
  }
  next();
});
