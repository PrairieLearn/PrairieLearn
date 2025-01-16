import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import type { OnboardingStepInfo } from '../../lib/onboarding.js';

export function InstructorCourseAdminOnboarding({
  steps,
  resLocals,
}: {
  steps: OnboardingStepInfo[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Onboarding checklist' })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container">
          ${CourseSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h1>Onboarding checklist</h1>
            </div>
            <div class="card-body text-left" style="text-wrap: balance;">
              <p class="mb-3">Complete these task suggestions to finish setting up your course.</p>
              <div class="list-group mb-3">
                ${steps.map((step, index) =>
                  OnboardingStep({
                    stepNumber: index + 1,
                    step,
                  }),
                )}
              </div>
              <form method="POST">
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                <button
                  name="__action"
                  value="dismiss_onboarding"
                  class="btn btn-sm btn-primary"
                  type="submit"
                  aria-describedby="dismiss_onboarding_help"
                >
                  Dismiss onboarding
                </button>
                <small id="dismiss_onboarding_help" class="form-text text-muted">
                  This page can be restored from the course settings.
                </small>
              </form>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function OnboardingStep({ stepNumber, step }: { stepNumber: number; step: OnboardingStepInfo }) {
  let stepHeader = `${stepNumber}. ${step.header}`;
  if (step.optional) {
    stepHeader += ' (optional)';
  }
  return html`
    <div class="list-group-item">
      <div class="d-flex align-items-center gap-3">
        <i
          class="fa-regular ${step.isComplete
            ? 'fa-check-circle text-success'
            : 'fa-circle text-muted'} "
        ></i>
        <div class=${step.isComplete ? 'opacity-50' : ''}>
          ${!step.isComplete && step.link
            ? html` <a href="${step.link}">
                <p class="my-0">${stepHeader}</p>
              </a>`
            : html`<p class="my-0">${stepHeader}</p>`}
          <p class="text-muted my-0">${step.description}</p>
        </div>
      </div>
    </div>
  `;
}