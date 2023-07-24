import { CourseInstanceSchema, CourseSchema, InstitutionSchema } from '../../../lib/db-types';
import { getEnrollmentForUserInCourseInstance } from '../../../models/enrollment';
import {
  getPlanGrantsForContext,
  getPlanNamesFromPlanGrants,
  getRequiredPlansForCourseInstance,
} from '../../lib/billing/plans';
import { planGrantsMatchPlanFeatures } from './plans-types';

// TODO: move this out of the middleware directory since it isn't actually a middleware?
// Alternatively, actually make this a middleware and use it in the appropriate places.
export async function checkPlanGrants(req, res) {
  // We'll only check plan grants for course instances, as students can't
  // currently ever access a course directly. And even if they could, plan
  // grans aren't associated with courses.
  if (!res.locals.course_instance) {
    return true;
  }

  // We won't check plan grants if the user has a specific role in the course
  // or course instance. We always grant instructors access to data.
  //
  // TODO: is this conditional checking the correct values?
  // TODO: how do we account for user overrides when checking plan grants?
  if (
    res.locals.authz_data.course_role !== 'None' ||
    res.locals.authz_data.course_instance_role !== 'None'
  ) {
    return true;
  }

  const institution = InstitutionSchema.parse(res.locals.institution);
  const course = CourseSchema.parse(res.locals.course);
  const course_instance = CourseInstanceSchema.parse(res.locals.course_instance);
  const enrollment = await getEnrollmentForUserInCourseInstance({
    user_id: res.locals.authn_user.id,
    course_instance_id: course_instance.id,
  });

  console.log(institution, course, course_instance);
  console.log(res.locals);

  const requiredPlans = await getRequiredPlansForCourseInstance(course_instance.id);
  const planGrants = await getPlanGrantsForContext({
    institution_id: institution.id,
    course_instance_id: course_instance.id,
    enrollment_id: enrollment?.id,
    user_id: res.locals.authn_user.id,
  });
  const planGrantNames = getPlanNamesFromPlanGrants(planGrants);

  console.log(planGrantNames, requiredPlans);
  const satisfies = planGrantsMatchPlanFeatures(planGrantNames, requiredPlans);

  return satisfies;
}
