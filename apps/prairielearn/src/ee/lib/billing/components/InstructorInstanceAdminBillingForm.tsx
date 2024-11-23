import { h } from 'preact';
import React, { useState } from 'preact/hooks';

import { type PlanName, planGrantsMatchPlanFeatures } from '../plans-types.js';

interface InstructorInstanceAdminBillingInput {
  initialRequiredPlans: PlanName[];
  desiredRequiredPlans: PlanName[];
  institutionPlanGrants: PlanName[];
  courseInstancePlanGrants: PlanName[];
  enrollmentCount: number;
  enrollmentLimit: number;
  editable: boolean;
}

interface InstructorInstanceAdminBillingState {
  studentBillingEnabled: boolean;
  studentBillingCanChange: boolean;
  studentBillingDidChange: boolean;
  studentBillingAlert: AlertProps | null;
  computeEnabled: boolean;
  computeCanChange: boolean;
  computeDidChange: boolean;
  computeAlert: AlertProps | null;
}

export interface InstructorInstanceAdminBillingFormProps
  extends InstructorInstanceAdminBillingInput {
  enrollmentLimitSource: 'course_instance' | 'institution';
  externalGradingQuestionCount: number;
  workspaceQuestionCount: number;
  csrfToken: string;
}

interface AlertProps {
  message: string;
  color: 'success' | 'warning' | 'danger';
}

export function instructorInstanceAdminBillingState(
  input: InstructorInstanceAdminBillingInput,
): InstructorInstanceAdminBillingState {
  const studentBillingInitialEnabled = input.initialRequiredPlans.includes('basic');
  const studentBillingEnabled = input.desiredRequiredPlans.includes('basic');
  const computeEnabledByInstitution = planGrantsMatchPlanFeatures(input.institutionPlanGrants, [
    'compute',
  ]);
  const computeEnabledByCourseInstance = planGrantsMatchPlanFeatures(
    input.courseInstancePlanGrants,
    ['compute'],
  );
  const computeEnabled =
    (!studentBillingEnabled && (computeEnabledByInstitution || computeEnabledByCourseInstance)) ||
    input.desiredRequiredPlans.includes('compute');

  let studentBillingCanChange = input.editable;
  const studentBillingDidChange =
    input.initialRequiredPlans.includes('basic') !== input.desiredRequiredPlans.includes('basic');
  let studentBillingAlert: AlertProps | null = null;
  if (studentBillingInitialEnabled && input.enrollmentCount > input.enrollmentLimit) {
    studentBillingCanChange = false;
    const inflectedCountVerb = input.enrollmentCount === 1 ? 'is' : 'are';
    const inflectedCountNoun = input.enrollmentCount === 1 ? 'enrollment' : 'enrollments';
    studentBillingAlert = {
      message: [
        `There ${inflectedCountVerb} ${input.enrollmentCount} ${inflectedCountNoun} in this course, which exceeds the limit of ${input.enrollmentLimit}.`,
        'To disable student billing, first remove excess enrollments.',
      ].join(' '),
      color: 'warning',
    };
  }

  let computeCanChange = input.editable;
  const computeDidChange =
    input.initialRequiredPlans.includes('compute') !==
    input.desiredRequiredPlans.includes('compute');
  let computeAlert: AlertProps | null = null;
  if (!studentBillingEnabled && (computeEnabledByInstitution || computeEnabledByCourseInstance)) {
    computeCanChange = false;
    computeAlert = {
      message:
        'This course instance already has access to compute features without additional payment.',
      color: 'success',
    };
  }

  return {
    studentBillingEnabled,
    studentBillingCanChange,
    studentBillingDidChange,
    studentBillingAlert,
    computeEnabled,
    computeCanChange,
    computeDidChange,
    computeAlert,
  };
}

export function InstructorInstanceAdminBillingForm(props: InstructorInstanceAdminBillingFormProps) {
  const {
    enrollmentCount,
    enrollmentLimit,
    enrollmentLimitSource,
    externalGradingQuestionCount,
    workspaceQuestionCount,
    editable,
    csrfToken,
  } = props;

  const [basicPlanEnabled, setBasicPlanEnabled] = useState(
    props.initialRequiredPlans.includes('basic'),
  );
  const [computePlanEnabled, setComputePlanEnabled] = useState(
    props.initialRequiredPlans.includes('compute'),
  );

  const requiredPlans: PlanName[] = [];
  if (basicPlanEnabled) requiredPlans.push('basic');
  if (computePlanEnabled) requiredPlans.push('compute');

  const {
    studentBillingEnabled,
    studentBillingCanChange,
    studentBillingAlert,
    computeEnabled,
    computeCanChange,
    computeAlert,
  } = instructorInstanceAdminBillingState({
    ...props,
    desiredRequiredPlans: requiredPlans,
  });

  const enrollmentLimitPercentage = Math.min(100, (enrollmentCount / enrollmentLimit) * 100);
  const enrollmentLimitExceeded = enrollmentCount > enrollmentLimit;

  // Make the colored portion of the progress bar at least 2% wide at all
  // times to ensure that it's not just a gray box.
  const enrollmentLimitProgressBarPercentage = Math.max(2, enrollmentLimitPercentage);
  const enrollmentLimitProgressBarColor = enrollmentLimitExceeded
    ? 'bg-danger'
    : enrollmentLimitPercentage > 90
      ? 'bg-warning'
      : 'bg-primary';

  return (
    <form method="POST" class="js-billing-form">
      <h2 class="h4">Enrollments</h2>
      <div class="mb-3">
        <div class="d-flex flex-row align-items-center">
          <span class="mr-2">
            {formatEnrollmentCount(enrollmentCount, enrollmentLimit, studentBillingEnabled)}
          </span>
          <div
            class={`progress flex-grow-1 ${studentBillingEnabled ? 'd-none' : ''}`}
            style="max-width: 100px"
          >
            <div
              class={`progress-bar ${enrollmentLimitProgressBarColor}`}
              role="progressbar"
              style={{ width: `${enrollmentLimitProgressBarPercentage}%` }}
              aria-valuenow={enrollmentCount}
              aria-valuemin={0}
              aria-valuemax={enrollmentLimit}
            ></div>
          </div>
        </div>
        <div class="small text-muted">
          {enrollmentLimitExplanation({
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
          checked={studentBillingEnabled}
          disabled={!studentBillingCanChange}
          value="1"
          id="studentBillingEnabled"
          onChange={(e) => setBasicPlanEnabled(e.currentTarget.checked)}
        />
        <label class="form-check-label" for="studentBillingEnabled">
          Enable student billing for enrollments
        </label>
        <p class="small text-muted">
          When student billing is enabled, students pay for access to your course instance. Enabling
          student billing will allow your course instance to exceed any enrollment limits that would
          otherwise apply.
        </p>
        {studentBillingAlert && <Alert {...studentBillingAlert} />}
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
          checked={computeEnabled}
          disabled={!computeCanChange}
          value="1"
          id="computeEnabled"
          onChange={(e) => setComputePlanEnabled(e.currentTarget.checked)}
        />
        <label class="form-check-label" for="computeEnabled">
          External grading and workspaces
        </label>
        <p class="small text-muted">
          Students will be able to use questions that utilize external grading and/or workspaces.
          This course has
          <strong>{pluralizeQuestionCount(externalGradingQuestionCount)}</strong> that use external
          grading and <strong>{pluralizeQuestionCount(workspaceQuestionCount)}</strong> that use
          workspaces.
        </p>
        {computeAlert && <Alert {...computeAlert} />}
      </div>

      {/* TODO: something should be showing this. But what/when? */}
      <div
        class="alert alert-warning js-student-billing-warning"
        data-student-billing-enabled={studentBillingEnabled}
        hidden
      >
        Any students currently enrolled in your course will lose access until they have paid for the
        above features. If your course is currently in session, you should carefully consider the
        impact of enabling student billing. Before proceeding, you should communicate this change to
        your students.
      </div>

      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <button type="submit" class="btn btn-primary" disabled={!editable}>
        Save
      </button>
    </form>
  );
}

function Alert(props: AlertProps) {
  return <div class={`alert alert-${props.color}`}>${props.message}</div>;
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

function formatEnrollmentCount(
  enrollmentCount: number,
  enrollmentLimit: number,
  studentBillingEnabled: boolean,
) {
  if (studentBillingEnabled) {
    const pluralizedEnrollments = enrollmentCount === 1 ? 'enrollment' : 'enrollments';

    // Student billing doesn't have a limit, so don't show it.
    return `${enrollmentCount} ${pluralizedEnrollments}`;
  } else {
    const pluralizedEnrollments = enrollmentLimit === 1 ? 'enrollment' : 'enrollments';

    return `${enrollmentCount} / ${enrollmentLimit} ${pluralizedEnrollments}`;
  }
}
