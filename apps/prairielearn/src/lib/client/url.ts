export function getStudentCourseInstanceUrl(courseInstanceId: string): string {
  return `/pl/course_instance/${courseInstanceId}`;
}

export type AssessmentInstanceUrlParts =
  | {
      urlPrefix: string;
      courseInstanceId?: undefined;
    }
  // If urlPrefix is not provided, then course_instance_id
  // must be provided and the appropriate URL prefix will be constructed
  | { urlPrefix?: undefined; courseInstanceId: string };

export function getAssessmentInstanceUrl({
  urlPrefix,
  assessmentId,
  courseInstanceId,
  publicURL = false,
}: { publicURL?: boolean; assessmentId: string } & AssessmentInstanceUrlParts) {
  if (publicURL) {
    urlPrefix = `/pl/public/course_instance/${courseInstanceId}`;
  } else if (urlPrefix === undefined) {
    // Construct the URL prefix with the appropriate course instance
    urlPrefix = `/pl/course_instance/${courseInstanceId}/instructor`;
  }

  return `${urlPrefix}/assessment/${assessmentId}`;
}

export function getStudentEnrollmentUrl(courseInstanceId: string, enrollmentId: string): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/instance_admin/enrollment/${enrollmentId}`;
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
  return `/pl/course_instance/${courseInstanceId}/instructor/instance_admin/settings`;
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

export function getCourseInstanceJobSequenceUrl(
  courseInstanceId: string,
  jobSequenceId: string,
): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/jobSequence/${jobSequenceId}`;
}

export function getCourseInstanceEditErrorUrl(
  courseInstanceId: string,
  jobSequenceId: string,
): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/edit_error/${jobSequenceId}`;
}

export function getCourseEditErrorUrl(courseId: string, jobSequenceId: string): string {
  return `/pl/course/${courseId}/edit_error/${jobSequenceId}`;
}

export function getCourseInstanceSettingsUrl(courseInstanceId: string): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/instance_admin/settings`;
}
