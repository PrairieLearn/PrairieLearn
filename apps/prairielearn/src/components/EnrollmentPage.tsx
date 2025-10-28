import { PageLayout } from './PageLayout.js';

interface EnrollmentPageProps {
  resLocals: Record<string, any>;
  type: 'blocked' | 'self-enrollment-disabled';
}

function BlockedEnrollment() {
  return (
    <div class="container">
      <div class="row justify-content-center">
        <div class="col-lg-8 col-xl-6">
          <div class="card">
            <div class="card-header bg-primary text-white">
              <h4 class="mb-0">Enrollment blocked</h4>
            </div>
            <div class="card-body">
              <p class="mb-0">
                Your enrollment in this course has been blocked. If you believe you were blocked by
                mistake, contact your instructor.
              </p>
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
            <div class="card-header bg-primary text-white">
              <h4 class="mb-0">Self-enrollment not available</h4>
            </div>
            <div class="card-body">
              <p class="mb-0">
                Self-enrollment is not enabled for this course. If you believe self-enrollment
                should be enabled, contact your instructor.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EnrollmentPage({ resLocals, type }: EnrollmentPageProps) {
  const pageTitle = type === 'blocked' ? 'Enrollment blocked' : 'Self-enrollment not available';

  return PageLayout({
    resLocals,
    pageTitle,
    navContext: {
      type: 'student',
      page: 'enroll',
    },
    content: type === 'blocked' ? <BlockedEnrollment /> : <SelfEnrollmentDisabled />,
  });
}
