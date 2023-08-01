import { type Response } from 'express';

import { CourseInstanceSchema, InstitutionSchema, UserSchema } from '../../../lib/db-types';
import {
  getPlanGrantsForPartialContexts,
  getPlanNamesFromPlanGrants,
  getRequiredPlansForCourseInstance,
} from '../../lib/billing/plans';
import { planGrantsMatchPlanFeatures } from './plans-types';

export async function checkPlanGrants(res: Response) {
  // We won't check plan grants if the user has a specific role in the course
  // or course instance. We always grant instructor-like users access to all
  // features.
  //
  // This function should always be run after the `authzCourseOrInstance`
  // middleware, which will have taken into account the effective user
  // and any overridden roles.
  if (
    res.locals.authz_data.course_role !== 'None' ||
    res.locals.authz_data.course_instance_role !== 'None'
  ) {
    return true;
  }

  const institution = InstitutionSchema.parse(res.locals.institution);
  const course_instance = CourseInstanceSchema.parse(res.locals.course_instance);
  const user = UserSchema.parse(res.locals.user);

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
    user_id: user.user_id,
  });
  const planGrantNames = getPlanNamesFromPlanGrants(planGrants);

  return planGrantsMatchPlanFeatures(planGrantNames, requiredPlans);
}
