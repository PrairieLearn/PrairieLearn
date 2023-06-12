import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

export function InstructorCourseInstanceBilling({
  studentBillingEnabled,
  computeEnabled,
  computeGrantedByInstitution,
  enrollmentCount,
  enrollmentLimit,
  enrollmentLimitSource,
  externalGradingQuestionCount = 0,
  workspaceQuestionCount = 0,
  resLocals,
}: {
  studentBillingEnabled: boolean;
  computeEnabled: boolean;
  computeGrantedByInstitution: boolean;
  enrollmentCount: number;
  enrollmentLimit: number;
  enrollmentLimitSource: 'course_instance' | 'institution';
  externalGradingQuestionCount: number;
  workspaceQuestionCount: number;
  resLocals: Record<string, any>;
}) {
  const enrollmentLimitText = studentBillingEnabled ? '∞' : enrollmentLimit;
  const enrollmentLimitPercentage = studentBillingEnabled
    ? 0
    : Math.max(0, Math.min(100, (enrollmentCount / enrollmentLimit) * 100)).toFixed(2);
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../../pages/partials/head') %>", {
          ...resLocals,
        })}
        ${compiledScriptTag('instructorInstanceAdminBillingClient.ts')}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../../pages/partials/navbar') %>", {
          ...resLocals,
        })}
        <main class="container mb-4">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">Billing</div>
            <div class="card-body">
              <form method="POST">
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
                  />
                  <label class="form-check-label" for="studentBillingEnabled">
                    Enable student billing for enrollments
                  </label>
                  <p class="small text-muted">
                    When student billing is enabled, students pay for access to your course
                    instance. Enabling student billing will allow your course instance to exceed any
                    enrollment limits that would otherwise apply.
                  </p>
                </div>

                <h2 class="h4">Features</h2>
                <p>
                  If your course requires certain features, you can enable them so that students can
                  pay for them.
                </p>

                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    name="compute_enabled"
                    ${computeEnabled || computeGrantedByInstitution ? 'checked' : ''}
                    value="1"
                    id="computeEnabled"
                    ${computeGrantedByInstitution ? 'disabled' : ''}
                  />
                  <label class="form-check-label" for="computeEnabled">
                    External grading and workspaces
                  </label>
                  <p class="small text-muted">
                    Students will be able to use questions that utilize external grading and/or
                    workspaces. This course has
                    <strong>${pluralizeQuestionCount(externalGradingQuestionCount)}</strong> that
                    use external grading and
                    <strong>${pluralizeQuestionCount(workspaceQuestionCount)}</strong> that use
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
                  Any students currently enrolled in your course will lose access until they have
                  paid for the above features. If your course is currently in session, you should
                  carefully consider the impact of enabling student billing. Before proceeding, you
                  should communicate this change to your students.
                </div>

                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                <button type="submit" class="btn btn-primary">Save</button>
              </form>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
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
