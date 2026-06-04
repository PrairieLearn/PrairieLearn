import clsx from 'clsx';
import { useState } from 'react';

import { type PlanName, planGrantsMatchPlanFeatures } from '../../../lib/billing/plans-types.js';

interface InstructorInstanceAdminBillingInput {
  /** The current state */
  initialRequiredPlans: PlanName[];

  /** The desired state */
  desiredRequiredPlans: PlanName[];

  /** Grants for the institution */
  institutionPlanGrants: PlanName[];

  /** Grants for the course instance */
  courseInstancePlanGrants: PlanName[];

  /** Current count of students enrolled in the course instance */
  enrollmentCount: number;

  /** Maximum students that can be enrolled in the course instance */
  enrollmentLimit: number;

  /** Whether the fields are editable by the user */
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

interface InstructorInstanceAdminBillingFormProps extends InstructorInstanceAdminBillingInput {
  enrollmentLimitSource: 'course_instance' | 'institution';
  externalGradingQuestionCount: number;
  workspaceQuestionCount: number;
  csrfToken: string;
}

interface AlertProps {
  message: string;
  color: 'success' | 'warning' | 'danger';
}

export function instructorInstanceAdminBillingState({
  initialRequiredPlans,
  desiredRequiredPlans,
  institutionPlanGrants,
  courseInstancePlanGrants,
  editable,
  enrollmentCount,
  enrollmentLimit,
}: InstructorInstanceAdminBillingInput): InstructorInstanceAdminBillingState {
  const studentBillingInitialEnabled = initialRequiredPlans.includes('basic');
  const studentBillingEnabled = desiredRequiredPlans.includes('basic');
  const computeEnabledByInstitution = planGrantsMatchPlanFeatures(institutionPlanGrants, [
    'compute',
  ]);
  const computeEnabledByCourseInstance = planGrantsMatchPlanFeatures(courseInstancePlanGrants, [
    'compute',
  ]);
  const computeEnabled =
    (!studentBillingEnabled && (computeEnabledByInstitution || computeEnabledByCourseInstance)) ||
    desiredRequiredPlans.includes('compute');

  let studentBillingCanChange = editable;
  const studentBillingDidChange =
    initialRequiredPlans.includes('basic') !== desiredRequiredPlans.includes('basic');
  let studentBillingAlert: AlertProps | null = null;
  if (studentBillingInitialEnabled && enrollmentCount > enrollmentLimit) {
    studentBillingCanChange = false;
    const inflectedCountVerb = enrollmentCount === 1 ? 'is' : 'are';
    const inflectedCountNoun = enrollmentCount === 1 ? 'enrollment' : 'enrollments';
    studentBillingAlert = {
      message: [
        `There ${inflectedCountVerb} ${enrollmentCount} ${inflectedCountNoun} in this course, which exceeds the limit of ${enrollmentLimit}.`,
        'To disable student billing, first remove excess enrollments.',
      ].join(' '),
      color: 'warning',
    };
  }

  let computeCanChange = editable;
  const computeDidChange =
    initialRequiredPlans.includes('compute') !== desiredRequiredPlans.includes('compute');
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

export function InstructorInstanceAdminBillingForm({
  enrollmentCount,
  enrollmentLimit,
  enrollmentLimitSource,
  externalGradingQuestionCount,
  workspaceQuestionCount,
  editable,
  csrfToken,
  initialRequiredPlans,
  institutionPlanGrants,
  courseInstancePlanGrants,
}: InstructorInstanceAdminBillingFormProps) {
  const initialBasicPlanEnabled = initialRequiredPlans.includes('basic');
  const initialComputePlanEnabled = initialRequiredPlans.includes('compute');

  const [basicPlanEnabled, setBasicPlanEnabled] = useState(initialBasicPlanEnabled);
  const [computePlanEnabled, setComputePlanEnabled] = useState(initialComputePlanEnabled);

  const requiredPlans: PlanName[] = [];
  if (basicPlanEnabled) requiredPlans.push('basic');
  if (computePlanEnabled) requiredPlans.push('compute');

  const {
    studentBillingEnabled,
    studentBillingCanChange,
    studentBillingDidChange,
    studentBillingAlert,
    computeEnabled,
    computeCanChange,
    computeDidChange,
    computeAlert,
  } = instructorInstanceAdminBillingState({
    initialRequiredPlans,
    desiredRequiredPlans: requiredPlans,
    institutionPlanGrants,
    courseInstancePlanGrants,
    editable,
    enrollmentCount,
    enrollmentLimit,
  });

  const showEnableAlert =
    (studentBillingEnabled && studentBillingDidChange) || (computeEnabled && computeDidChange);

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
    <form method="POST" className="js-billing-form">
      <h2 className="h4">Enrollments</h2>
      <div className="mb-3">
        <div className="d-flex flex-row align-items-center">
          <span className="me-2">
            {formatEnrollmentCount(enrollmentCount, enrollmentLimit, studentBillingEnabled)}
          </span>
          <div
            className={clsx('progress flex-grow-1', { 'd-none': studentBillingEnabled })}
            style={{ maxWidth: '100px' }}
          >
            <div
              className={clsx('progress-bar', enrollmentLimitProgressBarColor)}
              role="progressbar"
              style={{ width: `${enrollmentLimitProgressBarPercentage}%` }}
              aria-valuenow={enrollmentCount}
              aria-valuemin={0}
              aria-valuemax={enrollmentLimit}
            />
          </div>
        </div>
        <div className="small text-muted">
          {enrollmentLimitExplanation({
            studentBillingEnabled,
            enrollmentLimit,
            enrollmentLimitSource,
          })}
        </div>
      </div>

      <div className="form-check">
        <input
          className="form-check-input"
          type="checkbox"
          name="student_billing_enabled"
          checked={studentBillingEnabled}
          disabled={!studentBillingCanChange}
          value="1"
          id="studentBillingEnabled"
          onChange={(e) => setBasicPlanEnabled(e.currentTarget.checked)}
        />
        <label className="form-check-label" htmlFor="studentBillingEnabled">
          Enable student billing for enrollments
        </label>
        <p className="small text-muted">
          When student billing is enabled, students pay for access to your course instance. Enabling
          student billing will allow your course instance to exceed any enrollment limits that would
          otherwise apply.
        </p>
        {studentBillingAlert && <Alert {...studentBillingAlert} />}
      </div>

      <h2 className="h4">Features</h2>
      <p>
        If your course requires certain features, you can enable them so that students can pay for
        them.
      </p>

      <div className="form-check">
        <input
          className="form-check-input"
          type="checkbox"
          name="compute_enabled"
          checked={computeEnabled}
          disabled={!computeCanChange}
          value="1"
          id="computeEnabled"
          onChange={(e) => setComputePlanEnabled(e.currentTarget.checked)}
        />
        <label className="form-check-label" htmlFor="computeEnabled">
          External grading and workspaces
        </label>
        <p className="small text-muted">
          Students will be able to use questions that utilize external grading and/or workspaces.
          This course has <strong>{pluralizeQuestionCount(externalGradingQuestionCount)}</strong>{' '}
          that use external grading and{' '}
          <strong>{pluralizeQuestionCount(workspaceQuestionCount)}</strong> that use workspaces.
        </p>
        {computeAlert && <Alert {...computeAlert} />}
      </div>

      {showEnableAlert && (
        <div className="alert alert-warning" role="alert">
          Any students currently enrolled in your course will lose access until they have paid for
          the above features. If your course is currently in session, you should carefully consider
          the impact of enabling student billing. Before proceeding, you should communicate this
          change to your students.
        </div>
      )}

      <input type="hidden" name="__csrf_token" value={csrfToken} />
      <button type="submit" className="btn btn-primary" disabled={!editable}>
        Save
      </button>
    </form>
  );
}

InstructorInstanceAdminBillingForm.displayName = 'InstructorInstanceAdminBillingForm';

function Alert(props: AlertProps) {
  return <div className={clsx('alert', `alert-${props.color}`)}>{props.message}</div>;
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
