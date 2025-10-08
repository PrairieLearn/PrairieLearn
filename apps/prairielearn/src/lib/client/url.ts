import type { StaffCourseInstanceContext, StudentCourseInstanceContext } from './page-context.js';

export function getStudentCourseInstanceUrl(
  context: StudentCourseInstanceContext | StaffCourseInstanceContext,
): string {
  return `/pl/course_instance/${context.course_instance.id}`;
}

export type AssessmentInstanceUrlParts =
  | {
      urlPrefix: string;
      courseInstanceId?: undefined;
      plainUrlPrefix?: undefined;
    }
  // If urlPrefix is not provided, then plainUrlPrefix and course_instance_id
  // must be provided and the appropriate URL prefix will be constructed
  | { urlPrefix?: undefined; plainUrlPrefix: string; courseInstanceId: string };

export function getAssessmentInstanceUrl({
  urlPrefix,
  assessmentId,
  courseInstanceId,
  plainUrlPrefix,
  publicURL = false,
}: { publicURL?: boolean; assessmentId: string } & AssessmentInstanceUrlParts) {
  if (publicURL) {
    urlPrefix = `${plainUrlPrefix}/public/course_instance/${courseInstanceId}`;
  } else if (urlPrefix === undefined) {
    // Construct the URL prefix with the appropriate course instance
    urlPrefix = `${plainUrlPrefix}/course_instance/${courseInstanceId}/instructor`;
  }

  return `${urlPrefix}/assessment/${assessmentId}`;
}

export function getStudentEnrollmentUrl(urlPrefix: string, enrollment_id: string): string {
  return `${urlPrefix}/instance_admin/enrollment/${enrollment_id}`;
}

export function getSelfEnrollmentLinkUrl({
  courseInstanceId,
  enrollmentCode,
}: {
  courseInstanceId: string;
  enrollmentCode: string;
}): string {
  return `/pl/course_instance/${courseInstanceId}/join/${enrollmentCode}`;
}

export function getSelfEnrollmentSettingsUrl(courseInstanceId: string): string {
  return `/pl/course_instance/${courseInstanceId}/instance_admin/settings`;
}

export function getSelfEnrollmentLookupUrl(
  enrollmentCode: string,
  courseInstanceId?: string,
): string {
  const params = new URLSearchParams();
  params.set('code', encodeURIComponent(enrollmentCode));
  if (courseInstanceId) {
    params.set('course_instance_id', courseInstanceId);
  }
  return `/pl/course_instance/lookup?${params.toString()}`;
}
