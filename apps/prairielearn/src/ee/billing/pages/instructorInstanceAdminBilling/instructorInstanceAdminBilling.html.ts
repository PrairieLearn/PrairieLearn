import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

interface InstructorCourseInstanceBillingProps {
  resLocals: Record<string, any>;
}

export function InstructorCourseInstanceBilling({
  resLocals,
}: InstructorCourseInstanceBillingProps) {
  return html`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../../pages/partials/head') %>", {
          ...resLocals,
        })}
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
                    value=""
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
              </form>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
