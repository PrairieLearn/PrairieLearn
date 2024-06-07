import { compiledScriptTag } from '@prairielearn/compiled-assets';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

export function StudentAssessment({ resLocals }: { resLocals: Record<string, any> }) {
  const { assessment_set, assessment, course, authz_result, user, __csrf_token } = resLocals;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", resLocals)}
        ${compiledScriptTag('studentAssessmentClient.js')}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: '',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${assessment_set.abbreviation}${assessment.number}: ${assessment.title}
              ${assessment.group_work ? html` <i class="fas fa-users"></i> ` : ''}
            </div>

            <div class="card-body">
              ${authz_result.mode === 'Exam' || authz_result.password != null
                ? html`
                    <p class="lead text-center">
                      Please wait until instructed to start by a proctor
                    </p>
                  `
                : ''}

              <p class="lead text-center">
                This is
                <strong>${assessment_set.name} ${assessment.number}: ${assessment.title}</strong>
                for <strong>${course.short_name}</strong>
              </p>

              ${authz_result.time_limit_min != null
                ? html`
                    <p class="lead text-center">
                      The time limit for this assessment is
                      <strong>
                        ${authz_result.time_limit_min}
                        ${authz_result.time_limit_min === 1 ? 'minute' : 'minutes'}
                      </strong>
                    </p>
                  `
                : ''}
              ${assessment.group_work
                ? renderEjs(
                    import.meta.url,
                    "<%- include('../partials/studentGroupControls.ejs'); %>",
                    resLocals,
                  )
                : html`
                    ${assessment.require_honor_code
                      ? html`
                          <div class="card card-secondary mb-4 test-class-honor-code">
                            <ul class="list-group list-group-flush">
                              <li class="list-group-item py-2">
                                I certify that I am ${user.name} and I am allowed to take this
                                assessment.
                              </li>
                              <li class="list-group-item py-2">
                                I pledge on my honor that I will not give or receive any
                                unauthorized assistance on this assessment and that all work will be
                                my own.
                              </li>
                            </ul>

                            <div class="card-footer text-center border-top-0 py-2">
                              <span class="form-check d-inline">
                                <input
                                  type="checkbox"
                                  class="form-check-input"
                                  id="certify-pledge"
                                />
                                <label
                                  class="form-check-label font-weight-bold"
                                  for="certify-pledge"
                                >
                                  I certify and pledge the above.
                                </label>
                              </span>
                            </div>
                          </div>
                        `
                      : ''}
                    <form
                      id="confirm-form"
                      name="confirm-form"
                      method="POST"
                      class="d-flex justify-content-center"
                    >
                      <input type="hidden" name="__action" value="new_instance" />
                      <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                      <button
                        id="start-assessment"
                        type="submit"
                        class="btn btn-primary"
                        ${assessment.require_honor_code ? 'disabled' : ''}
                      >
                        Start assessment
                      </button>
                    </form>
                  `}
            </div>
            <!-- card-body -->
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
