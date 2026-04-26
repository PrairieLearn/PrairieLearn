import type { Assessment, AssessmentInstance, AssessmentSet } from './db-types.js';
import type { UntypedResLocals } from './res-locals.types.js';

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
