import asyncHandler = require('express-async-handler');

import { PlanFeatureName } from '../lib/billing/plans-types';
import { CourseInstanceSchema, InstitutionSchema, QuestionSchema } from '../../lib/db-types';
import { getPlanGrantsForContext, planGrantsMatchFeatures } from '../lib/billing/plans';
import { features } from '../../lib/features';

export default asyncHandler(async (req, res, next) => {
  // For the time being, put this being a feature flag so that we can land
  // this change before we've created plan grants for all existing institutions.
  const shouldCheck = await features.enabledFromLocals(
    'enforce-plan-grants-for-questions',
    res.locals,
  );

  const question = QuestionSchema.parse(res.locals.question);
  const requiredFeatures: PlanFeatureName[] = [];
  if (question.external_grading_enabled) {
    requiredFeatures.push('external-grading');
  }
  if (question.workspace_image) {
    requiredFeatures.push('workspaces');
  }

  // If there aren't any features to check, don't even bother hitting the database.
  if (!shouldCheck || requiredFeatures.length === 0) {
    next();
    return;
  }

  const institution = InstitutionSchema.parse(res.locals.institution);
  const course_instance = CourseInstanceSchema.parse(res.locals.course_instance);

  // TODO: This should use `getPlanGrantsForContext`, which will be available after
  // the following PR is merged: https://github.com/PrairieLearn/PrairieLearn/pull/8213
  //
  // TODO: We also need to all the user ID here.
  const planGrants = await getPlanGrantsForContext({
    institution_id: institution.id,
    course_instance_id: course_instance.id,
  });

  if (!planGrantsMatchFeatures(planGrants, requiredFeatures)) {
    // TODO: Show a fancier error page explaining what happened and prompting
    // the user to contact their instructor.
    throw new Error('Access denied');
  }

  next();
});
