import { selectPublishingExtensionsByEnrollmentId } from '../models/course-instance-publishing-extensions.js';

import {
  type CourseInstance,
  type Enrollment,
  type EnumCourseInstanceRole,
  type EnumCourseRole,
  type EnumMode,
  type EnumModeReason,
} from './db-types.js';

export interface CourseInstanceAccessParams {
  course_instance_role: EnumCourseInstanceRole;
  course_role: EnumCourseRole;
  mode_reason: EnumModeReason;
  mode: EnumMode;
  enrollment: Enrollment | null;
}

/**
 * Evaluates whether a user can access a course instance based on the course instance's
 * access control settings and the user's authorization context.
 */
export async function evaluateCourseInstanceAccess(
  courseInstance: CourseInstance,
  params: CourseInstanceAccessParams,
  // This is done like this for testing purposes.
  currentDate: Date = new Date(),
): Promise<
  | {
      hasAccess: true;
    }
  | {
      hasAccess: false;
      reason: string;
    }
> {
  // Staff with course or course instance roles always have access
  if (params.course_role !== 'None' || params.course_instance_role !== 'None') {
    return { hasAccess: true };
  }

  // If no start date is set, the course instance is not published
  if (courseInstance.publishing_publish_date == null) {
    return {
      hasAccess: false,
      reason: 'Course instance is not published',
    };
  }

  if (currentDate < courseInstance.publishing_publish_date) {
    return {
      hasAccess: false,
      reason: 'Course instance is not yet published',
    };
  }

  // Check if course instance has been archived
  if (
    courseInstance.publishing_archive_date &&
    currentDate > courseInstance.publishing_archive_date
  ) {
    return {
      hasAccess: false,
      reason: 'Course instance has been archived',
    };
  }

  // Consider the latest enabled extensions for the enrollment.
  const publishingExtensions = params.enrollment
    ? await selectPublishingExtensionsByEnrollmentId(params.enrollment.id)
    : [];
  // const publishingExtensions: any[] = [];

  const possibleArchiveDates = publishingExtensions.map((extension) => extension.archive_date);

  if (possibleArchiveDates.length > 0) {
    const sortedPossibleArchiveDates = possibleArchiveDates.sort((a, b) => {
      return b.getTime() - a.getTime();
    });

    if (currentDate > sortedPossibleArchiveDates[0]) {
      return {
        hasAccess: false,
        reason: 'Course instance has been archived',
      };
    }
  }

  return { hasAccess: true };
}
