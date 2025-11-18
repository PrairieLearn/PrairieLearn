import type { UntypedResLocals } from '../lib/res-locals.js';

import { PageLayout } from './PageLayout.js';

interface EnrollmentPageProps {
  resLocals: UntypedResLocals;
  type:
    | 'blocked'
    | 'self-enrollment-disabled'
    | 'self-enrollment-expired'
    | 'institution-restriction';
}

function BlockedEnrollment() {
  return (
    <div class="container">
      <div class="row justify-content-center">
        <div class="col-lg-8 col-xl-6">
          <div class="card">
            <div class="card-header bg-danger text-white">
              <h4 class="mb-0">Enrollment blocked</h4>
            </div>
            <div class="card-body">
              <p>
                You were blocked from accessing this course. If you believe you were blocked by
                mistake, contact your instructor.
              </p>
              <a href="/pl" class="btn btn-primary">
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
    <div class="container">
      <div class="row justify-content-center">
        <div class="col-lg-8 col-xl-6">
          <div class="card">
            <div class="card-header bg-danger text-white">
              <h4 class="mb-0">Self-enrollment not available</h4>
            </div>
            <div class="card-body">
              <p>
                Self-enrollment is not enabled for this course. If you believe self-enrollment
                should be enabled, contact your instructor.
              </p>
              <a href="/pl" class="btn btn-primary">
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
    <div class="container">
      <div class="row justify-content-center">
        <div class="col-lg-8 col-xl-6">
          <div class="card">
            <div class="card-header bg-danger text-white">
              <h4 class="mb-0">Self-enrollment expired</h4>
            </div>
            <div class="card-body">
              <p>
                Self-enrollment for this course has expired. If you believe you should still be able
                to enroll, contact your instructor.
              </p>
              <a href="/pl" class="btn btn-primary">
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
    <div class="container">
      <div class="row justify-content-center">
        <div class="col-lg-8 col-xl-6">
          <div class="card">
            <div class="card-header bg-danger text-white">
              <h4 class="mb-0">Institution restriction</h4>
            </div>
            <div class="card-body">
              <p>
                Self-enrollment for this course is restricted to users from the same institution. If
                you believe you should be able to enroll, contact your instructor.
              </p>
              <a href="/pl" class="btn btn-primary">
                Return home
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EnrollmentPage({ resLocals, type }: EnrollmentPageProps) {
  const pageTitle =
    type === 'blocked'
      ? 'Enrollment blocked'
      : type === 'self-enrollment-expired'
        ? 'Self-enrollment expired'
        : type === 'institution-restriction'
          ? 'Institution restriction'
          : 'Self-enrollment not available';

  const content =
    type === 'blocked' ? (
      <BlockedEnrollment />
    ) : type === 'self-enrollment-expired' ? (
      <SelfEnrollmentExpired />
    ) : type === 'institution-restriction' ? (
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
