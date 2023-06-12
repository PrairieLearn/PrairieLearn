import { html } from '@prairielearn/html';
import { PlanName, planGrantsMatchPlanFeatures } from '../plans-types';

interface InstructorInstanceAdminBillingInput {
  initialRequiredPlans: PlanName[];
  requiredPlans: PlanName[];
  institutionPlanGrants: PlanName[];
  courseInstancePlanGrants: PlanName[];
  enrollmentCount: number;
  enrollmentLimit: number;
}

interface InstructorInstanceAdminBillingState {
  studentBillingEnabled: boolean;
  studentBillingCanChange: boolean;
  computeEnabled: boolean;
  computeCanChange: boolean;
  alertMessage: string | null;
}

export function instructorInstanceAdminBillingState(
  input: InstructorInstanceAdminBillingInput
): InstructorInstanceAdminBillingState {
  const studentBillingEnabled = input.requiredPlans.includes('basic');
  const computeEnabledByInstitutionOrCourseInstance = planGrantsMatchPlanFeatures(
    input.institutionPlanGrants.concat(input.courseInstancePlanGrants),
    'compute'
  );
  const computeEnabled =
    (!studentBillingEnabled && computeEnabledByInstitutionOrCourseInstance) ||
    input.requiredPlans.includes('compute');

  let studentBillingCanChange = true;
  if (input.enrollmentCount > input.enrollmentLimit) {
    studentBillingCanChange = false;
  }

  let computeCanChange = true;
  if (!studentBillingEnabled && computeEnabledByInstitutionOrCourseInstance) {
    computeCanChange = false;
  }

  let alertMessage: string | null = null;
  if (input.initialRequiredPlans.includes('basic') && !input.requiredPlans.includes('basic')) {
    alertMessage =
      'Disabling student billing will forbid students from accessing this course instance until excess enrollments are removed.';
  }

  return {
    studentBillingEnabled,
    studentBillingCanChange,
    computeEnabled,
    computeCanChange,
    alertMessage,
  };
}

export function InstructorInstanceAdminBillingForm(
  props: InstructorInstanceAdminBillingInput & {
    enrollmentLimitSource: 'course_instance' | 'institution';
    externalGradingQuestionCount: number;
    workspaceQuestionCount: number;
    csrfToken: string;
  }
) {
  const {
    initialRequiredPlans,
    requiredPlans,
    institutionPlanGrants,
    courseInstancePlanGrants,
    enrollmentCount,
    enrollmentLimit,
    enrollmentLimitSource,
    externalGradingQuestionCount,
    workspaceQuestionCount,
    csrfToken,
  } = props;

  const { studentBillingEnabled, studentBillingCanChange, computeEnabled, computeCanChange } =
    instructorInstanceAdminBillingState({
      initialRequiredPlans,
      requiredPlans,
      institutionPlanGrants,
      courseInstancePlanGrants,
      enrollmentCount,
      enrollmentLimit,
    });
  const enrollmentLimitText = studentBillingEnabled ? '∞' : enrollmentLimit;
  const enrollmentLimitPercentage = studentBillingEnabled
    ? 0
    : Math.max(0, Math.min(100, (enrollmentCount / enrollmentLimit) * 100)).toFixed(2);

  return html`
    <form method="POST" class="js-billing-form" data-props="${JSON.stringify(props)}">
      <h2 class="h4">Enrollments</h2>
      <div class="mb-3">
        <div class="progress">
          <div
            class="progress-bar"
            role="progressbar"
            style="width: ${enrollmentLimitPercentage}%"
            aria-valuenow="25"
            aria-valuemin="0"
            aria-valuemax="100"
          ></div>
        </div>
        <div>${enrollmentCount} / ${enrollmentLimitText} enrollments</div>
        <div class="small text-muted">
          ${enrollmentLimitExplanation({
            studentBillingEnabled,
            enrollmentLimit,
            enrollmentLimitSource,
          })}
        </div>
      </div>

      <div class="form-check">
        <input
          class="form-check-input"
          type="checkbox"
          name="student_billing_enabled"
          ${studentBillingEnabled ? 'checked' : ''}
          value="1"
          id="studentBillingEnabled"
          ${!studentBillingCanChange ? 'disabled' : ''}
        />
        <label class="form-check-label" for="studentBillingEnabled">
          Enable student billing for enrollments
        </label>
        <p class="small text-muted">
          When student billing is enabled, students pay for access to your course instance. Enabling
          student billing will allow your course instance to exceed any enrollment limits that would
          otherwise apply.
        </p>
      </div>

      <h2 class="h4">Features</h2>
      <p>
        If your course requires certain features, you can enable them so that students can pay for
        them.
      </p>

      <div class="form-check">
        <input
          class="form-check-input"
          type="checkbox"
          name="compute_enabled"
          ${computeEnabled ? 'checked' : ''}
          value="1"
          id="computeEnabled"
          ${!computeCanChange ? 'disabled' : ''}
        />
        <label class="form-check-label" for="computeEnabled">
          External grading and workspaces
        </label>
        <p class="small text-muted">
          Students will be able to use questions that utilize external grading and/or workspaces.
          This course has
          <strong>${pluralizeQuestionCount(externalGradingQuestionCount)}</strong> that use external
          grading and <strong>${pluralizeQuestionCount(workspaceQuestionCount)}</strong> that use
          workspaces.
        </p>
      </div>

      <div
        class="alert alert-warning js-student-billing-warning"
        data-student-billing-enabled="${studentBillingEnabled}"
        data-compute-enabled="${computeEnabled}"
        data-enrollment-count="${enrollmentCount}"
        data-enrollment-limit="${enrollmentLimit}"
        hidden
      >
        Any students currently enrolled in your course will lose access until they have paid for the
        above features. If your course is currently in session, you should carefully consider the
        impact of enabling student billing. Before proceeding, you should communicate this change to
        your students.
      </div>

      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="submit" class="btn btn-primary">Save</button>
    </form>
  `;
}

function enrollmentLimitExplanation({
  studentBillingEnabled,
  enrollmentLimit,
  enrollmentLimitSource,
}: {
  studentBillingEnabled: boolean;
  enrollmentLimit: number;
  enrollmentLimitSource: 'course_instance' | 'institution';
}): string {
  if (studentBillingEnabled) {
    return 'Student billing for enrollments is enabled, so there is no enrollment limit.';
  }

  if (enrollmentLimitSource === 'course_instance') {
    return `This course instance has an enrollment limit of ${enrollmentLimit}.`;
  }

  return `This course's institution has a per-course-instance enrollment limit of ${enrollmentLimit}.`;
}

function pluralizeQuestionCount(count: number) {
  return count === 1 ? `${count} question` : `${count} questions`;
}
