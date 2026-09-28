import { Alert, Card } from 'react-bootstrap';

import type { EnrollmentCapacity } from '../../../ee/models/enrollment.js';

export interface EnrollmentAndBillingCardProps {
  studentBillingEnabled: boolean;
  studentComputeBillingEnabled: boolean;
  enrollmentCount: number;
  capacity: EnrollmentCapacity | null;
  enrollmentLimitReached: boolean;
}

export function EnrollmentAndBillingCard({
  studentBillingEnabled,
  studentComputeBillingEnabled,
  enrollmentCount,
  capacity,
  enrollmentLimitReached,
}: EnrollmentAndBillingCardProps) {
  return (
    <Card aria-labelledby="enrollment-and-billing-heading">
      <Card.Body>
        <h2 id="enrollment-and-billing-heading" className="h5 card-title mb-3">
          Enrollment and billing
        </h2>
        <h3 className="h6">
          {studentBillingEnabled
            ? 'Student billing enabled'
            : studentComputeBillingEnabled
              ? 'Student billing for compute features'
              : 'Student payment not required'}
        </h3>
        {studentBillingEnabled ? (
          <p className="mb-0">Students pay for access to this course instance.</p>
        ) : !studentComputeBillingEnabled ? (
          <p className="mb-0">Students can enroll without paying for course access.</p>
        ) : null}
        {studentComputeBillingEnabled && (
          <p className="mb-0">Students pay for external grading and workspaces.</p>
        )}
        {studentBillingEnabled && (
          <p className="mt-3 mb-0">
            {enrollmentCount.toLocaleString('en-US')}{' '}
            {enrollmentCount === 1 ? 'enrollment' : 'enrollments'}
          </p>
        )}
        {capacity && (
          <div className="mt-3">
            <h3 className="h6">Enrollment allowance</h3>
            <p className="mb-0">
              {capacity.used.toLocaleString('en-US')} of {capacity.limit.toLocaleString('en-US')}{' '}
              enrollments used{' · '}
              <strong>{capacity.remaining.toLocaleString('en-US')} remaining</strong>
            </p>
            {capacity.annualLimitSource && (
              <p className="mt-2 mb-0">
                Remaining capacity is limited by the {capacity.annualLimitSource}'s shared
                enrollment limit over the past year.
              </p>
            )}
            {capacity.paid > 0 && (
              <p className="small text-muted mt-2 mb-0">
                Students with individually purchased or sponsored course access do not use this
                allowance.
              </p>
            )}
          </div>
        )}
        {enrollmentLimitReached && (
          <Alert variant="warning" className="mt-3 mb-0">
            {capacity
              ? 'The enrollment allowance has been reached. Contact support to increase it.'
              : 'An enrollment limit has been reached. Contact support to enable additional enrollments.'}
          </Alert>
        )}
      </Card.Body>
    </Card>
  );
}
