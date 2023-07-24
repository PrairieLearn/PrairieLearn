import { type Response } from 'express';

import { CourseInstanceSchema, InstitutionSchema, UserSchema } from '../../../lib/db-types';
import { getEnrollmentForUserInCourseInstance } from '../../../models/enrollment';
import {
  getPlanGrantsForContextRecursive,
  getPlanNamesFromPlanGrants,
  getRequiredPlansForCourseInstance,
} from '../../lib/billing/plans';
import { planGrantsMatchPlanFeatures } from './plans-types';

export async function checkPlanGrants(res: Response) {
  // We'll only check plan grants for course instances, as students can't
  // currently ever access a course directly. And even if they could, plan
  // grans aren't associated with courses.
  if (!res.locals.course_instance) {
    return true;
  }

  // We won't check plan grants if the user has a specific role in the course
  // or course instance. We always grant instructor-like users access to all
  // features.
  if (
    res.locals.authz_data.course_role !== 'None' ||
    res.locals.authz_data.course_instance_role !== 'None'
  ) {
    return true;
  }

  const institution = InstitutionSchema.parse(res.locals.institution);
  const course_instance = CourseInstanceSchema.parse(res.locals.course_instance);
  const user = UserSchema.parse(res.locals.user);

  const enrollment = await getEnrollmentForUserInCourseInstance({
    // Note that this takes into account user overrides set by instructors.
    // This means that instructors impersonating a student will see the same
    // behavior that students themselves would see. If the instructor wants to
    // bypass any plan grant checks, they can use the "Student view without
    // access restrictions" option.
    user_id: user.user_id,
    course_instance_id: course_instance.id,
  });

  const requiredPlans = await getRequiredPlansForCourseInstance(course_instance.id);

  // We use `getPlanGrantsForContextRecursive` to get all plan grants that apply
  // to the enrollment, *or* the course instance, *or* the institution, or directly
  // to the user.
  const planGrants = await getPlanGrantsForContextRecursive({
    institution_id: institution.id,
    course_instance_id: course_instance.id,
    enrollment_id: enrollment?.id ?? null,
    user_id: user.user_id,
  });
  const planGrantNames = getPlanNamesFromPlanGrants(planGrants);

  return planGrantsMatchPlanFeatures(planGrantNames, requiredPlans);
}
