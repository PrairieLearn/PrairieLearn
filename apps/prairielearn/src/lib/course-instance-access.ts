import assert from 'node:assert';

import { selectPublishingExtensionsByEnrollmentId } from '../models/course-instance-publishing-extensions.js';

import {
  type CourseInstance,
  type Enrollment,
  type EnumCourseInstanceRole,
  type EnumCourseRole,
} from './db-types.js';

export interface CourseInstanceAccessParams {
  course_instance_role: EnumCourseInstanceRole;
  course_role: EnumCourseRole;
  enrollment: Enrollment | null;
}

/**
 * Evaluates whether a user can access a course instance based on the course instance's
 * access control settings and the user's authorization context.
 */
export async function evaluateModernCourseInstanceAccess(
  courseInstance: CourseInstance,
  { course_role, course_instance_role, enrollment }: CourseInstanceAccessParams,
  // This is done like this for testing purposes.
  currentDate: Date,
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
  if (course_role !== 'None' || course_instance_role !== 'None') {
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

  // Archive date is always set alongside publish date
  assert(courseInstance.publishing_archive_date != null);

  // Consider the latest enabled date for the enrollment.
  const publishingExtensions =
    enrollment != null ? await selectPublishingExtensionsByEnrollmentId(enrollment.id) : [];

  const allDates = [
    courseInstance.publishing_archive_date,
    ...publishingExtensions.map((extension) => extension.archive_date),
  ].sort((a, b) => {
    return b.getTime() - a.getTime();
  });

  const latestDate = allDates[0];

  if (currentDate > latestDate) {
    return {
      hasAccess: false,
      reason: 'Course instance has been archived',
    };
  }

  return { hasAccess: true };
}
