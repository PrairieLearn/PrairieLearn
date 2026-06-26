import assert from 'node:assert';

import { HttpStatusError } from '@prairielearn/error';

import { type Assessment, type AssessmentSet } from '../lib/db-types.js';
import { typedAsyncHandler } from '../lib/res-locals.js';
import { selectAssessmentSetById } from '../models/assessment-set.js';
import { selectOptionalAssessmentById } from '../models/assessment.js';

export interface ResLocalsPublicAssessment {
  assessment: Assessment;
  assessment_set: AssessmentSet;
}

/**
 * Selects and authorizes access to a publicly shared assessment. The assessment
 * must have `share_source_publicly` enabled and belong to the resolved course
 * instance; otherwise, responds with a 404 Not Found error.
 *
 * Must run after `authzPublicCourseInstance`, which sets `res.locals.course_instance`.
 *
 * On success, sets `res.locals.assessment` and `res.locals.assessment_set`.
 */
export default typedAsyncHandler<'public-assessment'>(async (req, res, next) => {
  const assessment = await selectOptionalAssessmentById(req.params.assessment_id);
  if (
    !assessment?.share_source_publicly ||
    assessment.course_instance_id !== res.locals.course_instance.id
  ) {
    throw new HttpStatusError(404, 'Not Found');
  }

  assert(assessment.assessment_set_id);
  const assessment_set = await selectAssessmentSetById(assessment.assessment_set_id);

  res.locals.assessment = assessment;
  res.locals.assessment_set = assessment_set;

  next();
});
