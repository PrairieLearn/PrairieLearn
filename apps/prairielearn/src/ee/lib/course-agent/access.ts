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
