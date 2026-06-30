import type {
  Assessment,
  AssessmentInstance,
  AssessmentSet,
  EnumAssessmentType,
} from './db-types.js';
import type { UntypedResLocals } from './res-locals.types.js';

export interface AssessmentInstanceTimeLimit {
  /** Milliseconds remaining until the instance's time runs out; null if untimed. */
  assessment_instance_remaining_ms: number | null;
  /** Total duration of the instance's time limit in milliseconds; null if untimed. */
  assessment_instance_time_limit_ms: number | null;
  /** Whether the instance's `date_limit` has passed. */
  assessment_instance_time_limit_expired: boolean;
}

/**
 * Computes the time-limit display values for an assessment instance from its
 * resolved access result. The effective end is the earlier of the PrairieTest
 * exam access end (`exam_access_end`, null when not in a reservation) and the
 * instance's own `date_limit` (null when untimed).
 *
 * This is the single source of truth for these values, called after access
 * control is resolved. Both the legacy (sproc) and modern (TypeScript resolver)
 * paths feed their resolved `exam_access_end` through here, so the timer can't
 * diverge from the access decision that produced it.
 */
export function getAssessmentInstanceTimeLimit({
  examAccessEnd,
  date,
  dateLimit,
  reqDate,
}: {
  examAccessEnd: Date | null;
  date: Date | null;
  dateLimit: Date | null;
  reqDate: Date;
}): AssessmentInstanceTimeLimit {
  // The earlier of the two ends, ignoring nulls; null only if both are null.
  const effectiveEnd =
    examAccessEnd === null || (dateLimit !== null && dateLimit < examAccessEnd)
      ? dateLimit
      : examAccessEnd;

  return {
    assessment_instance_remaining_ms:
      effectiveEnd === null ? null : effectiveEnd.getTime() - reqDate.getTime(),
    assessment_instance_time_limit_ms:
      effectiveEnd === null || date === null ? null : effectiveEnd.getTime() - date.getTime(),
    assessment_instance_time_limit_expired: dateLimit !== null && dateLimit <= reqDate,
  };
}

export function assessmentLabel(
  assessment: { number: string },
  assessmentSet: { abbreviation: string },
): string {
  return assessmentSet.abbreviation + assessment.number;
}

export function assessmentInstanceLabel(
  assessmentInstance: AssessmentInstance,
  assessment: Assessment,
  assessmentSet: AssessmentSet,
): string {
  let label = assessmentLabel(assessment, assessmentSet);
  if (assessment.multiple_instance) {
    label += '#' + assessmentInstance.number;
  }
  return label;
}

export function formatStudentQuestionTitle({
  assessmentType,
  questionNumber,
  questionTitle,
  showQuestionTitles,
}: {
  assessmentType: EnumAssessmentType;
  questionNumber: string;
  questionTitle: string | null | undefined;
  showQuestionTitles: boolean | undefined;
}): string {
  const title = questionTitle?.trim() ? questionTitle : null;
  if (assessmentType === 'Exam') {
    return showQuestionTitles && title
      ? `Question ${questionNumber}: ${title}`
      : `Question ${questionNumber}`;
  }

  return showQuestionTitles && title ? `${questionNumber}. ${title}` : questionNumber;
}

/**
 * This is used to conditionally display/permit a shortcut to delete the
 * assessment instance. Usually, the only way to delete an assessment instance
 * is from the "Students" tab of an assessment. However, when a staff member is
 * iterating on or testing an assessment, it can be tedious to constantly go
 * back to that page to delete the instance in order to recreate it.
 *
 * The shortcut is a "Regenerate assessment instance" button on the assessment
 * instance page and instance question page. It's only displayed if the user
 * has the necessary permissions: either "Previewer" or above access on the
 * course, or "Student Data Viewer" or above access on the course instance.
 * We're deliberately permissive with these permissions to allow "untrusted"
 * course staff to e.g. perform quality control on assessments.
 *
 * We have an extra check: the instance must have been created by a user that
 * was an instructor at the time of creation. This addresses the case where
 * some user was an enrolled student in course instance X and was later added
 * as course staff to course instance Y. In this case, the user should not be
 * able to delete their old assessment instances in course instance X. This
 * check is performed with the `assessment_instances.include_in_statistics`
 * column, which reflects whether or not the user was an instructor at the time
 * of creation. We'll rename this column to something more general, e.g.
 * `created_by_instructor`, in a future migration.
 *
 * There's one exception to the above check: the example course, where
 * `include_in_statistics` is generally `false` even when instructors create
 * assessment instances; this is because the example course has weird implicit
 * permissions.
 *
 * Note that we check for `authn_` permissions specifically. This ensures that
 * the menu appears for both "student view" and "student view without access
 * restrictions".
 *
 * @returns Whether or not the user should be allowed to delete the assessment instance.
 */
export function canDeleteAssessmentInstance(resLocals: UntypedResLocals): boolean {
  return (
    // Check for permissions.
    (resLocals.authz_data.authn_has_course_permission_preview ||
      resLocals.authz_data.authn_has_course_instance_permission_view) &&
    // Check that the assessment instance belongs to this user, or that the
    // user belongs to the group that created the assessment instance.
    resLocals.authz_result.authorized_edit &&
    // Check that the assessment instance was created by an instructor; bypass
    // this check if the course is an example course.
    (!resLocals.assessment_instance.include_in_statistics || resLocals.course.example_course)
  );
}
