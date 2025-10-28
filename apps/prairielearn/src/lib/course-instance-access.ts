// import assert from 'node:assert';

// import { selectPublishingExtensionsByEnrollmentId } from '../models/course-instance-publishing-extensions.js';

// import {
//   type CourseInstance,
//   type Enrollment,
//   type EnumCourseInstanceRole,
//   type EnumCourseRole,
// } from './db-types.js';

// export interface CourseInstanceAccessParams {
//   course_instance_role: EnumCourseInstanceRole;
//   course_role: EnumCourseRole;
//   enrollment: Enrollment | null;
// }

// /**
//  * Evaluates whether a user can access a course instance based on the course instance's
//  * access control settings and the user's authorization context.
//  */
// export async function evaluateModernCourseInstanceAccess(
//   courseInstance: CourseInstance,
//   { course_role, course_instance_role, enrollment }: CourseInstanceAccessParams,
//   // This is done like this for testing purposes.
//   currentDate: Date,
// ): Promise<
//   | {
//       has_instructor_access: false;
//       has_student_access: boolean;
//       has_student_access_with_enrollment: boolean;
//     }
//   | {
//       has_instructor_access: false;
//       has_student_access: false;
//       has_student_access_with_enrollment: false;
//       reason: string;
//     }
//   | {
//       has_instructor_access: true;
//       has_student_access: null;
//       has_student_access_with_enrollment: null;
//     }
// > {
//   // Staff with course or course instance roles always have access
//   if (course_role !== 'None' || course_instance_role !== 'None') {
//     return {
//       has_instructor_access: true,
//       has_student_access: true,
//       has_student_access_with_enrollment: true,
//     };
//   }

//   // If no start date is set, the course instance is not published
//   if (courseInstance.publishing_start_date == null) {
//     return {
//       hasAccess: false,
//       reason: 'Course instance is not published',
//     };
//   }

//   if (currentDate < courseInstance.publishing_start_date) {
//     return {
//       hasAccess: false,
//       reason: 'Course instance is not yet published',
//     };
//   }

//   // End date is always set alongside start date
//   assert(courseInstance.publishing_end_date != null);

//   // Consider the latest enabled date for the enrollment.
//   const publishingExtensions =
//     enrollment != null ? await selectPublishingExtensionsByEnrollmentId(enrollment.id) : [];

//   const allDates = [
//     courseInstance.publishing_end_date,
//     ...publishingExtensions.map((extension) => extension.end_date),
//   ].sort((a, b) => {
//     return b.getTime() - a.getTime();
//   });

//   const latestDate = allDates[0];

//   if (currentDate > latestDate) {
//     return {
//       hasAccess: false,
//       reason: 'Course instance is not published',
//     };
//   }

//   return { hasAccess: true, has_student_access: true, has_student_access_with_enrollment: true };
// }
