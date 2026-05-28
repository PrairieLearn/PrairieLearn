import { parseAsMultiSelectFilter } from '@prairielearn/ui';

import { encodeSearchString } from '../uri-util.shared.js';

export function getStudentCourseInstanceUrl(courseInstanceId: string): string {
  return `/pl/course_instance/${courseInstanceId}`;
}

export type AssessmentUrlParts =
  | { urlPrefix: string; courseInstanceId?: undefined }
  // If urlPrefix is not provided, then course_instance_id
  // must be provided and the appropriate URL prefix will be constructed
  | { urlPrefix?: undefined; courseInstanceId: string };

export function getAssessmentUrl({
  urlPrefix,
  assessmentId,
  courseInstanceId,
  publicURL = false,
}: { publicURL?: boolean; assessmentId: string } & AssessmentUrlParts) {
  if (publicURL) {
    urlPrefix = `/pl/public/course_instance/${courseInstanceId}`;
  } else if (urlPrefix === undefined) {
    urlPrefix = `/pl/course_instance/${courseInstanceId}/instructor`;
  }

  return `${urlPrefix}/assessment/${assessmentId}`;
}

export function getAssessmentQuestionEditorUrl(
  parts: { assessmentId: string; qid: string } & AssessmentUrlParts,
): string {
  const encodedQid = encodeURIComponent(parts.qid).replaceAll('%2F', '/');
  return `${getAssessmentUrl(parts)}/questions?selected=q:${encodedQid}`;
}

export function getAssessmentStudentsUrl(
  parts: { assessmentId: string } & AssessmentUrlParts,
): string {
  return `${getAssessmentUrl(parts)}/instances`;
}

export function getAssessmentSettingsUrl(
  parts: { assessmentId: string } & AssessmentUrlParts,
): string {
  return `${getAssessmentUrl(parts)}/settings`;
}

export function getStudentAssessmentUrl(courseInstanceId: string, assessmentId: string): string {
  return `${getStudentCourseInstanceUrl(courseInstanceId)}/assessment/${assessmentId}`;
}

export function getAssessmentDownloadUrl({
  courseInstanceId,
  assessmentId,
  filename,
}: {
  courseInstanceId: string;
  assessmentId: string;
  filename: string;
}): string {
  return `${getAssessmentUrl({ courseInstanceId, assessmentId })}/downloads/${filename}`;
}

export function getPublicAssessmentUrl(courseInstanceId: string, assessmentId: string): string {
  return `/pl/public/course_instance/${courseInstanceId}/assessment/${assessmentId}`;
}

export function getAssessmentInstanceUrl({
  courseInstanceId,
  assessmentInstanceId,
}: {
  courseInstanceId: string;
  assessmentInstanceId: string;
}) {
  return `/pl/course_instance/${courseInstanceId}/instructor/assessment_instance/${assessmentInstanceId}`;
}

export function getInstanceQuestionUrl({
  courseInstanceId,
  instanceQuestionId,
  variantId,
}: {
  courseInstanceId: string;
  instanceQuestionId: string;
  variantId?: string | null;
}) {
  const searchParams = variantId ? `?variant_id=${encodeURIComponent(variantId)}` : '';
  // TODO: Some questions are relying on relative URLs for certain functionality.
  // We should drop the slash between `instanceQuestionId` and `searchParams` when it is safe to do so.
  return `/pl/course_instance/${courseInstanceId}/instance_question/${instanceQuestionId}/${searchParams}`;
}

export function getStudentEnrollmentUrl(courseInstanceId: string, enrollmentId: string): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/instance_admin/enrollment/${enrollmentId}`;
}

export function getCourseInstanceStudentsUrl(courseInstanceId: string): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/instance_admin/students`;
}

export function getCourseInstanceStudentLabelsUrl(courseInstanceId: string): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/instance_admin/students/labels`;
}

export function getCourseInstancePublishingUrl(courseInstanceId: string): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/instance_admin/publishing`;
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

/** @knipignore */
export function getCourseInstanceSyncUrl(courseInstanceId: string): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/syncs`;
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

export function getQuestionPreviewUrl({
  courseId,
  courseInstanceId,
  questionId,
  isPublic = false,
}: {
  courseId: string;
  courseInstanceId?: string;
  questionId: string;
  isPublic?: boolean;
}): string {
  if (courseInstanceId) {
    return `/pl/course_instance/${courseInstanceId}/instructor/question/${questionId}/preview`;
  }
  if (isPublic) {
    return `/pl/public/course/${courseId}/question/${questionId}/preview`;
  }
  return `/pl/course/${courseId}/question/${questionId}/preview`;
}

export function getCourseIssuesUrl({
  qid,
  assessment,
  courseId,
  courseInstanceId,
}: {
  qid?: string | null;
  assessment?: string | null;
} & (
  | { courseInstanceId: string; courseId?: undefined }
  | { courseInstanceId?: undefined; courseId: string }
)): string {
  const urlPrefix = courseInstanceId
    ? `/pl/course_instance/${courseInstanceId}/instructor`
    : `/pl/course/${courseId}`;
  const query = encodeSearchString({ is: 'open', qid, assessment });
  return `${urlPrefix}/course_admin/issues?q=${query}`;
}

export function getAiQuestionGenerationDraftsUrl({ urlPrefix }: { urlPrefix: string }): string {
  return `${urlPrefix}/ai_generate_question_drafts`;
}

export function getAiGradingSettingsUrl(courseInstanceId: string): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/instance_admin/ai_grading`;
}

export function getManualGradingInstanceQuestionRubricPanelsUrl({
  courseInstanceId,
  assessmentId,
  instanceQuestionId,
}: {
  courseInstanceId: string;
  assessmentId: string;
  instanceQuestionId: string;
}): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/manual_grading/instance_question/${instanceQuestionId}/grading_rubric_panels`;
}

export function getAdministratorJobSequenceUrl(jobSequenceId: string): string {
  return `/pl/administrator/jobSequence/${jobSequenceId}`;
}

export function getAdministratorCourseRequestsUrl({ showAll }: { showAll?: boolean }): string {
  const base = '/pl/administrator/courseRequests';
  return showAll ? `${base}?status=all` : base;
}

export function getCourseInstanceBaseUrl(courseInstanceId: string): string {
  return `/pl/course_instance/${courseInstanceId}`;
}

type QuestionUrlParts =
  | { courseInstanceId: string; courseId?: undefined }
  | { courseInstanceId?: undefined; courseId: string };

type CourseAdminUrlParts =
  | { courseId: string; courseInstanceId?: string }
  | { courseId?: string; courseInstanceId: string };

export const QUESTION_TABLE_FILTER_URL_KEYS = {
  topic: 'topic',
  tag: 'tag',
  sharing_sets: 'sharing',
  display_type: 'version',
  grading_method: 'grading',
  external_grading_image: 'extImage',
  workspace_image: 'wsImage',
} as const;

interface CourseAdminQuestionsFilter {
  type: 'topic' | 'tag' | 'external_grading_image' | 'workspace_image';
  value: string;
}

const multiSelectFilterParser = parseAsMultiSelectFilter();

function getCourseAdminUrl({ courseInstanceId, courseId }: CourseAdminUrlParts): string {
  if (courseInstanceId) {
    return `/pl/course_instance/${courseInstanceId}/instructor/course_admin`;
  }
  return `/pl/course/${courseId}/course_admin`;
}

export function getCourseAdminQuestionsUrl(
  parts: CourseAdminUrlParts & { filter?: CourseAdminQuestionsFilter },
): string {
  const baseUrl = `${getCourseAdminUrl(parts)}/questions`;
  if (!parts.filter) return baseUrl;

  const searchParams = new URLSearchParams();
  searchParams.set(
    QUESTION_TABLE_FILTER_URL_KEYS[parts.filter.type],
    multiSelectFilterParser.serialize({ values: [parts.filter.value], mode: 'include' }),
  );

  return `${baseUrl}?${searchParams.toString()}`;
}

export function getQuestionUrl({
  courseInstanceId,
  courseId,
  questionId,
  variantId,
  variantSeed,
}: {
  questionId: string;
  variantId?: string | null;
  variantSeed?: string | null;
} & QuestionUrlParts): string {
  const urlPrefix = courseInstanceId
    ? `/pl/course_instance/${courseInstanceId}/instructor`
    : `/pl/course/${courseId}`;
  const searchParams = variantId
    ? `?variant_id=${encodeURIComponent(variantId)}`
    : variantSeed
      ? `?variant_seed=${encodeURIComponent(variantSeed)}`
      : '';
  return `${urlPrefix}/question/${questionId}/preview/${searchParams}`;
}

export function getQuestionCreateUrl(courseInstanceId: string): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/course_admin/questions/create`;
}

export function getQuestionSettingsUrl({
  questionId,
  courseInstanceId,
  courseId,
}: { questionId: string } & QuestionUrlParts): string {
  const urlPrefix = courseInstanceId
    ? `/pl/course_instance/${courseInstanceId}/instructor`
    : `/pl/course/${courseId}`;
  return `${urlPrefix}/question/${questionId}/settings`;
}

// tRPC scope URLs

export function getAdministratorTrpcUrl(): string {
  return '/pl/administrator/trpc';
}

export function getCourseTrpcUrl(courseId: string): string {
  return `/pl/course/${courseId}/trpc`;
}

export function getCourseInstanceTrpcUrl(courseInstanceId: string): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/trpc`;
}

export function getAssessmentTrpcUrl({
  courseInstanceId,
  assessmentId,
}: {
  courseInstanceId: string;
  assessmentId: string;
}): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/trpc`;
}

export function getAssessmentQuestionTrpcUrl({
  courseInstanceId,
  assessmentId,
  assessmentQuestionId,
}: {
  courseInstanceId: string;
  assessmentId: string;
  assessmentQuestionId: string;
}): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/assessment_question/${assessmentQuestionId}/trpc`;
}

export function getAssessmentManualGradingUrl({
  courseInstanceId,
  assessmentId,
}: {
  courseInstanceId: string;
  assessmentId: string;
}): string {
  return `/pl/course_instance/${courseInstanceId}/instructor/assessment/${assessmentId}/manual_grading`;
}
