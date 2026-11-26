import type { CourseRole, InstructorCourseInstanceRole } from '../../../lib/authz-data-lib.js';
import { config } from '../../../lib/config.js';
import type { Course, Institution, User } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { isEnterprise } from '../../../lib/license.js';

interface CourseAgentAccessContext {
  course: Course;
  institution: Institution;
  authn_user: User;
  authz_data: {
    has_course_permission_own: boolean;
    authn_has_course_permission_own: boolean;
  };
}

/**
 * Whether the current user may use the course agent in this course. Only
 * course owners have access, and conversations belong to the authenticated
 * user (not an emulated one).
 */
export async function courseAgentEnabled(context: CourseAgentAccessContext): Promise<boolean> {
  if (!isEnterprise()) return false;
  if (!config.courseAgentServiceUrl || !config.courseAgentServiceToken) return false;
  if (context.course.example_course) return false;
  if (!context.authz_data.has_course_permission_own) return false;
  if (!context.authz_data.authn_has_course_permission_own) return false;

  // Pass an explicit context (no course instance) so the flag resolves the
  // same way on course and course instance pages.
  return await features.enabled('course-agent', {
    institution_id: context.institution.id,
    course_id: context.course.id,
    user_id: context.authn_user.id,
  });
}

/** A role a course agent read or action can require: one of PrairieLearn's staff roles. */
export type CourseAgentRole = CourseRole | InstructorCourseInstanceRole;

export function isCourseInstanceRole(role: CourseAgentRole): role is InstructorCourseInstanceRole {
  return role === 'Student Data Viewer' || role === 'Student Data Editor';
}

/**
 * Why the course agent was refused for lacking all of `requiredRole`, in words it can pass on to
 * the instructor.
 */
export function missingRoleMessage(requiredRole: CourseAgentRole[]) {
  const courseRoles = requiredRole.filter((role) => !isCourseInstanceRole(role));
  const courseInstanceRoles = requiredRole.filter(isCourseInstanceRole);
  const access = [
    ...(courseRoles.length > 0 ? [`${courseRoles.join(' or ')} access to the course`] : []),
    ...(courseInstanceRoles.length > 0
      ? [`${courseInstanceRoles.join(' or ')} access in at least one course instance`]
      : []),
  ].join(', or ');
  return `The instructor needs ${access} for this, which they do not have. Tell them, and do not retry. A course Owner can grant it on the Staff page.`;
}
