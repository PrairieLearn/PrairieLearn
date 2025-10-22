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
      // This data structure mirrors the legacy access system.
      /*
      With the removal of the enrollment page, there are no such pages that need to consider if an unenrolled student
      could access the course instance. We only need to consider if a student that is already enrolled in the course instance
      has access to the course instance.

      However, processes that enroll students in the course instance need to consider this information, such as:

      - invitations (can't invite if course instance is not published)
        - should not let UI invite
        - backend check
      
      =================
        - accepting an invitation (can't accept if course instance is not published)
        - should not show on UI if not published
        - backend check
      - all actions -- (removing yourself, rejecting an invitation, etc.)
      - self-enrollment code (self-enrollment code is not valid if course instance is not published)
        - should show error like course instance doesn't exist
      - self-enrollment link (can't self-enroll via link if course instance is not published)
      - self-enrollment without code (can't self-enroll without code if course instance is not published)

      ** Does this check live in the model code? When I look up a code, do I pass in the current user,
      and evaluate access to even see if the code is valid?

      `selectCourseInstanceById(id, authzData)`
          -- no publishing checks if instructor, otherwise must be in range

      `inviteUser(instance, user)`
          -- instructors can invite students before the course instance is published
        
      TODO: add banner to instructor course instance pages if not published
      -- Tell status in this banner, "not visible to students"

      `selectCourseInstanceByEnrollmentCode(code, authzData)` -- no checks
          -- do you have permission to read the course instance record? and are not rate limited?
          -- publishing timing checks?

      -> enrollUser(instance, user)
          -- do you have permission to enroll this user?
          -- is this user already enrolled?
          -- is this user blocked?

      We should probably do this checking at the model layer, since if a student 
      can be invited depends on the student itself.

      Basically, call this function everywhere on each potential student.

      Scenario:
      - I add student A, and give them an extension.
      - They remove themselves from the course instance.
      - We still want to evaluate the extensions.
      - So that means that we could have removed -> invited students with existing extensions.
      - So each invitation needs to consider the student's existing extensions.
      
      TODO: Discussion with @Matt 10/17 about this.

      All these checks are complex. Given that, I want to split up the PR into data model + auth checks first.
      
      */
      /** If this specific student has access within the dates, considering extensions. */
      has_student_access: boolean;
      /** has_student_access && enrollment?.status === 'joined'. */
      /** Need this for middleware checks */
      has_student_access_with_enrollment: boolean;
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

  // Unpublish date is always set alongside publish date
  assert(courseInstance.publishing_unpublish_date != null);

  // Consider the latest enabled date for the enrollment.
  const publishingExtensions =
    enrollment != null ? await selectPublishingExtensionsByEnrollmentId(enrollment.id) : [];

  const allDates = [
    courseInstance.publishing_unpublish_date,
    ...publishingExtensions.map((extension) => extension.unpublish_date),
  ].sort((a, b) => {
    return b.getTime() - a.getTime();
  });

  const latestDate = allDates[0];

  if (currentDate > latestDate) {
    return {
      hasAccess: false,
      reason: 'Course instance has been unpublished',
    };
  }

  return { hasAccess: true };
}
