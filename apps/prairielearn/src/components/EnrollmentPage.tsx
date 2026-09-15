import type { EnrollmentIneligibilityReason } from '../lib/enrollment/eligibility.js';
import type { UntypedResLocals } from '../lib/res-locals.types.js';

import { PageLayout } from './PageLayout.js';

interface EnrollmentPageProps {
  reason: EnrollmentIneligibilityReason;
  resLocals: UntypedResLocals;
}

function BlockedEnrollment() {
  return (
    <div className="container">
      <div className="row justify-content-center">
        <div className="col-lg-8 col-xl-6">
          <div className="card">
            <div className="card-header bg-primary text-white">
              <h4 className="mb-0">Enrollment blocked</h4>
            </div>
            <div className="card-body">
              <p>
                You are blocked from accessing this course. If you believe you were blocked by
                mistake, contact your instructor.
              </p>
              <a href="/pl" className="btn btn-primary">
                Return home
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelfEnrollmentDisabled() {
  return (
    <div className="container">
      <div className="row justify-content-center">
        <div className="col-lg-8 col-xl-6">
          <div className="card">
            <div className="card-header bg-primary text-white">
              <h4 className="mb-0">Self-enrollment not available</h4>
            </div>
            <div className="card-body">
              <p>
                Self-enrollment is not enabled for this course. If you believe self-enrollment
                should be enabled, contact your instructor.
              </p>
              <a href="/pl" className="btn btn-primary">
                Return home
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelfEnrollmentExpired() {
  return (
    <div className="container">
      <div className="row justify-content-center">
        <div className="col-lg-8 col-xl-6">
          <div className="card">
            <div className="card-header bg-primary text-white">
              <h4 className="mb-0">Self-enrollment expired</h4>
            </div>
            <div className="card-body">
              <p>
                Self-enrollment for this course has expired. If you believe you should still be able
                to enroll, contact your instructor.
              </p>
              <a href="/pl" className="btn btn-primary">
                Return home
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InstitutionRestriction() {
  return (
    <div className="container">
      <div className="row justify-content-center">
        <div className="col-lg-8 col-xl-6">
          <div className="card">
            <div className="card-header bg-primary text-white">
              <h4 className="mb-0">Institution restriction</h4>
            </div>
            <div className="card-body">
              <p>
                Self-enrollment for this course is restricted to users from the same institution. If
                you believe you should be able to enroll, contact your instructor.
              </p>
              <a href="/pl" className="btn btn-primary">
                Return home
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EnrollmentPage({ reason, resLocals }: EnrollmentPageProps) {
  const pageTitle =
    reason === 'blocked'
      ? 'Enrollment blocked'
      : reason === 'self-enrollment-expired'
        ? 'Self-enrollment expired'
        : reason === 'institution-restriction'
          ? 'Institution restriction'
          : 'Self-enrollment not available';

  const content =
    reason === 'blocked' ? (
      <BlockedEnrollment />
    ) : reason === 'self-enrollment-expired' ? (
      <SelfEnrollmentExpired />
    ) : reason === 'institution-restriction' ? (
      <InstitutionRestriction />
    ) : (
      <SelfEnrollmentDisabled />
    );

  return PageLayout({
    resLocals,
    pageTitle,
    navContext: {
      type: 'student',
      page: 'enroll',
    },
    content,
  });
}
