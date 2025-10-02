import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import type { GettingStartedTaskInfo } from '../../lib/getting-started.js';

export function InstructorCourseAdminGettingStarted({
  tasks,
  resLocals,
}: {
  tasks: GettingStartedTaskInfo[];
  resLocals: Record<string, any>;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Getting started checklist',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'getting_started',
    },
    content: html`
      ${renderHtml(
        <CourseSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h1>Getting started checklist</h1>
        </div>
        <div class="card-body">
          <p class="mb-3">Complete these suggested tasks to finish setting up your course.</p>
          <div class="list-group mb-3">${tasks.map((task) => GettingStartedTask(task))}</div>
          <form method="POST">
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button
              name="__action"
              value="dismiss_getting_started"
              class="btn btn-sm btn-primary mb-1"
              type="submit"
              aria-describedby="dismiss_getting_started_help"
            >
              Dismiss the getting started checklist
            </button>
            <br />
            <small id="dismiss_getting_started_help" class="text-muted">
              This page can be restored from the course settings.
            </small>
          </form>
        </div>
      </div>
    `,
  });
}

function GettingStartedTask(task: GettingStartedTaskInfo) {
  return html`
    <div class="list-group-item">
      <div class="d-flex align-items-center gap-3">
        <i
          class="${task.isComplete
            ? 'fa-solid fa-check-circle text-success'
            : 'fa-regular fa-circle text-muted'} "
        ></i>
        <div>
          ${!task.isComplete && task.link
            ? html` <a href="${task.link}">
                <p class="my-0">${task.header}</p>
              </a>`
            : html`<p class="my-0">${task.header}</p>`}
          <p class="text-muted my-0">${task.description}</p>
        </div>
      </div>
    </div>
  `;
}
