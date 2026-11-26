import type { User } from '../../../lib/db-types.js';
import { features } from '../../../lib/features/index.js';
import { selectCoursesWithStaffAccess } from '../../../models/course.js';

/**
 * The courses the user can connect an agent to, with what the agent could do in each. Based on
 * the user's own roles: an administrator's access to every course does not count.
 */
export async function selectConnectableCourses(user: User) {
  const courses = await selectCoursesWithStaffAccess({
    user_id: user.id,
    is_administrator: false,
  });
  const connectable = await Promise.all(
    courses.map(async (course) => {
      const { has_course_permission_own, has_course_permission_edit, course_role } =
        course.permissions_course;
      if (course.example_course || !has_course_permission_edit) return null;
      const enabled = await features.enabled('mcp-server', {
        institution_id: course.institution_id,
        course_id: course.id,
        user_id: user.id,
      });
      if (!enabled) return null;
      return {
        id: course.id,
        name: [course.short_name, course.title].filter(Boolean).join(': '),
        role: course_role,
        can_read_data: has_course_permission_own,
      };
    }),
  );
  return connectable.filter((course) => course !== null);
}
