import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

interface InstructorCourseInstanceBillingProps {
  studentBillingEnabled: boolean;
  resLocals: Record<string, any>;
}

export function InstructorCourseInstanceBilling({
  studentBillingEnabled,
  resLocals,
}: InstructorCourseInstanceBillingProps) {
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
                    Enable student billing
                  </label>
                  <p class="small text-muted">
                    When student billing is enabled, students can pay for access to your course and
                    for additional features that you select.
                  </p>
                </div>

                <!-- TODO: only show this if there are existing enrollments? -->
                <div class="alert alert-warning">
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
