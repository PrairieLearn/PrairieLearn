import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';

export function InstructorCourseAdminOnboarding({
  courseHasCourseStaff,
  courseHasQuestion,
  courseHasCourseInstance,
  courseHasAssessment,
  resLocals,
}: {
  courseHasCourseStaff: boolean;
  courseHasQuestion: boolean;
  courseHasCourseInstance: boolean;
  courseHasAssessment: boolean;
  resLocals: Record<string, any>;
}) {
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
                  ${OnboardingStep({
                    stepNumber: 1,
                    header: 'Add Course Staff (Optional)',
                    description:
                      'Invite users to the course staff to help manage and deliver the course. If you are working alone, you can skip this step.',
                    link: 'staff',
                    complete: courseHasCourseStaff,
                  })}
                  ${OnboardingStep({
                    stepNumber: 2,
                    header: 'Create Your First Question',
                    description:
                      "A question is a problem or task that tests a student's understanding of a specific concept.",
                    link: 'questions',
                    complete: courseHasQuestion,
                  })}
                  ${OnboardingStep({
                    stepNumber: 3,
                    header: 'Create a Course Instance',
                    description:
                      'A course instance contains the assessments and other configuration for a single offering of a course.',
                    link: 'instances',
                    complete: courseHasCourseInstance,
                  })}
                  ${OnboardingStep({
                    stepNumber: 4,
                    header: 'Create an Assessment',
                    description:
                      "An assessment is a collection of questions designed to build or evaluate a student's knowledge.",
                    link: 'test.com',
                    complete: courseHasAssessment,
                  })}
                </div>
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
}: {
  stepNumber: number;
  header: string;
  description: string;
  link: string;
  complete: boolean;
}) {
  return html`
    <div class="list-group-item">
      <div class="d-flex align-items-center gap-3">
        <input
          type="checkbox"
          class="custom-control-input"
          id="customCheck1"
          ${complete ? 'checked' : ''}
          disabled
        />
        <div>
          <a href="${link}">
            <p class="my-0">${stepNumber}. ${header}</p>
          </a>
          <p class="text-muted my-0">${description}</p>
        </div>
      </div>
    </div>
  `;
}
