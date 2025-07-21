import type { StaffCourseInstanceContext, StudentCourseInstanceContext } from './page-context.js';

export function getStudentCourseInstanceUrl(
  context: StudentCourseInstanceContext | StaffCourseInstanceContext,
): string {
  return `/pl/course_instance/${context.course_instance.id}`;
}
