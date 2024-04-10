import { type Response } from 'express';

import {
  CourseInstance,
  CourseInstanceSchema,
  Institution,
  InstitutionSchema,
  QuestionSchema,
  UserSchema,
} from '../../../lib/db-types';
import {
  getPlanGrantsForPartialContexts,
  getPlanNamesFromPlanGrants,
  getRequiredPlansForCourseInstance,
  planGrantsMatchFeatures,
} from '../../lib/billing/plans';
import { PlanFeatureName, planGrantsMatchPlanFeatures } from './plans-types';
import { features } from '../../../lib/features';

type ResLocals = Record<string, any>;

function userHasRole(authz_data: any) {
  // We won't check plan grants if the user has a specific role in the course
  // or course instance. We always grant instructor-like users access to all
  // features.
  //
  // This function should always be run after the `authzCourseOrInstance`
  // middleware, which will have taken into account the effective user
  // and any overridden roles.
  return authz_data.course_role !== 'None' || authz_data.course_instance_role !== 'None';
}

export async function checkPlanGrantsForLocals(locals: ResLocals) {
  const institution = InstitutionSchema.parse(locals.institution);
  const course_instance = CourseInstanceSchema.parse(locals.course_instance);

  return await checkPlanGrants({
    institution,
    course_instance,
    authz_data: locals.authz_data,
  });
}

export async function checkPlanGrants({
  institution,
  course_instance,
  authz_data,
}: {
  institution: Institution;
  course_instance: CourseInstance;
  authz_data: any;
}): Promise<boolean> {
  if (userHasRole(authz_data)) {
    return true;
  }

  const requiredPlans = await getRequiredPlansForCourseInstance(course_instance.id);

  if (requiredPlans.length === 0) {
    // If there aren't any required plans, no need to check plan grants!
    return true;
  }

  // We use `getPlanGrantsForContextRecursive` to get all plan grants that apply
  // to the institution, *or* the course instance, *or* a user within a course instance,
  // *or* the user directly.
  const planGrants = await getPlanGrantsForPartialContexts({
    institution_id: institution.id,
    course_instance_id: course_instance.id,
    user_id: authz_data.user.user_id,
  });
  const planGrantNames = getPlanNamesFromPlanGrants(planGrants);

  return planGrantsMatchPlanFeatures(planGrantNames, requiredPlans);
}

export async function checkPlanGrantsForQuestion(res: Response) {
  if (userHasRole(res)) {
    return true;
  }

  const question = QuestionSchema.parse(res.locals.question);
  const requiredFeatures: PlanFeatureName[] = [];
  if (question.external_grading_enabled) {
    requiredFeatures.push('external-grading');
  }
  if (question.workspace_image) {
    requiredFeatures.push('workspaces');
  }

  // If there aren't any features to check, don't even bother hitting the database.
  if (requiredFeatures.length === 0) {
    return true;
  }

  // For the time being, put this behind a feature flag so that we can land
  // this change before we've created plan grants for all existing institutions.
  const shouldCheck = await features.enabledFromLocals(
    'enforce-plan-grants-for-questions',
    res.locals,
  );
  if (!shouldCheck) {
    return true;
  }

  const institution = InstitutionSchema.parse(res.locals.institution);
  const course_instance = CourseInstanceSchema.parse(res.locals.course_instance);
  const user = UserSchema.parse(res.locals.user);

  const planGrants = await getPlanGrantsForPartialContexts({
    institution_id: institution.id,
    course_instance_id: course_instance.id,
    user_id: user.user_id,
  });

  return planGrantsMatchFeatures(planGrants, requiredFeatures);
}
