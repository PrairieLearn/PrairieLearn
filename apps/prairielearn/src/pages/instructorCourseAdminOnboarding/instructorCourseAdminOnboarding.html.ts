import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';

export interface OnboardingStepInfo {
  // TODO: check - Is this okay?
  header: string;
  description: string;
  link: string;
  isComplete: boolean;
  optionalToComplete?: boolean;
}

export function InstructorCourseAdminOnboarding({
  steps,
  resLocals,
}: {
  steps: OnboardingStepInfo[];
  resLocals: Record<string, any>;
}) {
  const canDismiss = steps.every((step) => step.optionalToComplete || step.isComplete);
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Onboarding Tasklist' })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          ${CourseSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h1>Onboarding Tasks</h1>
            </div>
            <div class="my-4 card-body text-left" style="text-wrap: balance;">
              <div class="container">
                <p class="mb-3">
                  Here are some task suggestions to help you finish setting up your course.
                </p>
                <div class="list-group">
                  ${steps.map((step, index) =>
                    OnboardingStep({
                      stepNumber: index + 1,
                      header: step.header,
                      description: step.description,
                      link: step.link,
                      complete: step.isComplete,
                      optionalToComplete: step.optionalToComplete,
                    }),
                  )}
                </div>
                ${canDismiss
                  ? html` <p class="my-3">
                        All required tasks are complete. You can dismiss this page now.
                      </p>
                      <form method="POST">
                        <input
                          type="hidden"
                          name="__csrf_token"
                          value="${resLocals.__csrf_token}"
                        />
                        <button
                          name="__action"
                          value="dismiss_onboarding"
                          class="btn btn-sm btn-primary"
                          type="submit"
                        >
                          Dismiss Onboarding
                        </button>
                      </form>`
                  : ''}
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function OnboardingStep({
  stepNumber,
  header,
  description,
  link,
  complete,
  optionalToComplete,
}: {
  stepNumber: number;
  header: string;
  description: string;
  link: string;
  complete: boolean;
  optionalToComplete?: boolean;
}) {
  let stepHeader = `${stepNumber}. ${header}`;
  if (optionalToComplete) {
    stepHeader += ' (Optional)';
  }

  return html`
    <div class="list-group-item">
      <div class="d-flex align-items-center gap-3 ${complete ? 'opacity-50' : ''}">
        <input
          type="checkbox"
          class="custom-control-input"
          id="customCheck1"
          ${complete ? 'checked' : ''}
          disabled
        />
        <div>
          ${!complete
            ? html` <a href="${link}">
                <p class="my-0">${stepHeader}</p>
              </a>`
            : html`<p class="my-0">${stepHeader}</p>`}
          <p class="text-muted my-0">${description}</p>
        </div>
      </div>
    </div>
  `;
}
