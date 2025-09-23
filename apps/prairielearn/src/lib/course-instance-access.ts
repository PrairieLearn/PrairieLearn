import {
  type CourseInstance,
  type EnumCourseInstanceRole,
  type EnumCourseRole,
  type EnumMode,
  type EnumModeReason,
} from './db-types.js';

/**
 * Evaluates whether a user can access a course instance based on the course instance's
 * access control settings and the user's authorization context.
 */
export function evaluateCourseInstanceAccess(
  courseInstance: CourseInstance,
  params: {
    course_instance_role: EnumCourseInstanceRole;
    course_role: EnumCourseRole;
    mode_reason: EnumModeReason;
    mode: EnumMode;
  },
  // This is done like this for testing purposes.
  currentDate: Date = new Date(),
):
  | {
      hasAccess: true;
    }
  | {
      hasAccess: false;
      reason: string;
    } {
  // Staff with course or course instance roles always have access
  if (params.course_role !== 'None' || params.course_instance_role !== 'None') {
    return { hasAccess: true };
  }

  if (courseInstance.access_control_published === false) {
    return {
      hasAccess: false,
      reason: 'Course instance is not published',
    };
  }

  if (
    courseInstance.access_control_published_start_date_enabled === true &&
    courseInstance.access_control_published_start_date
  ) {
    if (currentDate < courseInstance.access_control_published_start_date) {
      return {
        hasAccess: false,
        reason: 'Course instance is not yet published',
      };
    }
  }

  if (courseInstance.access_control_published_end_date) {
    if (currentDate > courseInstance.access_control_published_end_date) {
      return {
        hasAccess: false,
        reason: 'Course instance has been archived',
      };
    }
  }

  return { hasAccess: true };
}
