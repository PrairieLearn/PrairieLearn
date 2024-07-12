import { z } from 'zod';

import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import {
  Lti13CourseInstance,
  Lti13Instance,
  AssessmentSchema,
  AssessmentSetSchema,
} from '../../../lib/db-types.js';

interface Lti13FullInstance {
  lti13_course_instance: Lti13CourseInstance;
  lti13_instance: Lti13Instance;
}

export const AssessmentRowSchema = AssessmentSchema.merge(
  AssessmentSetSchema.pick({ abbreviation: true, name: true, color: true }),
).extend({
  start_new_assessment_group: z.boolean(),
  assessment_group_heading: AssessmentSetSchema.shape.heading,
  label: z.string(),
});
type AssessmentRow = z.infer<typeof AssessmentRowSchema>;

export function InstructorInstanceAdminLti13({
  resLocals,
  instance,
  instances,
  assessments,
}: {
  resLocals: Record<string, any>;
  instance: Lti13FullInstance;
  instances: Lti13FullInstance[];
  assessments: AssessmentRow[];
}): string {
  const { urlPrefix } = resLocals;
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
        })}
      </head>
      <body>
        <script>
          $(() => {
            $('#selectLti13Instance').on('change', () => {
              let li = $('#selectLti13Instance option:selected');
              window.location.href =
                '/pl/course_instance/${resLocals.course_instance
                  .id}/instructor/instance_admin/lti13_instance/' + li.val();
            });
          });
        </script>
        ${renderEjs(import.meta.url, "<%- include('../../../pages/partials/navbar'); %>", {
          ...resLocals,
          navSubPage: 'lti13',
        })}
        <main class="container-fluid mb-4">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">LTI 1.3 configuration</div>
            <div class="card-body">
              <div class="row">
                <div class="col-2">
                  <select class="custom-select mb-2" id="selectLti13Instance">
                    ${instances.map((i) => {
                      return html`
                        <option
                          value="${i.lti13_course_instance.id}"
                          ${instance.lti13_course_instance.id === i.lti13_course_instance.id
                            ? 'selected'
                            : ''}
                        >
                          ${i.lti13_instance.name}: ${i.lti13_course_instance.context_label}
                        </option>
                      `;
                    })}
                  </select>
                  Quick links:
                  <ul>
                    <li><a href="#assessments">Assessments</a></li>
                    <li><a href="#connection">Connection to LMS</a></li>
                  </ul>
                  Created at: ${instance.lti13_course_instance.created_at.toDateString()}
                </div>
                <div class="col-10">
                  <h3 id="assessments">Assessments</h3>

                  <form method="POST">
                    <input type="hidden" name="__action" value="poll_lti13_assessments" />
                    <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                    <button class="btn btn-success">Poll LMS for assessment info</button>
                  </form>

                  <div class="table-responsive">
                    <table class="table table-sm table-hover">
                      <thead>
                        <tr>
                          <th style="width: 1%"><span class="sr-only">Label</span></th>
                          <th><span class="sr-only">Title</span></th>
                          <th>AID</th>
                          <th>LTI status</th>
                          <th>LTI actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${assessments.map(
                          (row) => html`
                            ${row.start_new_assessment_group
                              ? html`
                                  <tr>
                                    <th colspan="5">${row.assessment_group_heading}</th>
                                  </tr>
                                `
                              : ''}
                            <tr id="row-${row.id}">
                              <td class="align-middle" style="width: 1%">
                                <a
                                  href="${urlPrefix}/assessment/${row.id}/"
                                  class="badge color-${row.color} color-hover"
                                >
                                  ${row.label}
                                </a>
                              </td>
                              <td class="align-middle">
                                <a href="${urlPrefix}/assessment/${row.id}/"
                                  >${row.title}
                                  ${row.group_work
                                    ? html` <i class="fas fa-users" aria-hidden="true"></i> `
                                    : ''}</a
                                >
                              </td>
                              <td class="align-middle">${row.tid}</td>
                              <td></td>
                              <td></td>
                            </tr>
                          `,
                        )}
                      </tbody>
                    </table>
                  </div>

                  <h3 id="connection">Connection to LMS</h3>
                  <form method="POST">
                    <input type="hidden" name="__action" value="delete_lti13_course_instance" />
                    <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                    <button
                      class="btn btn-danger btn-sm"
                      onclick="return confirm('Are you sure you want to remove this connection?');"
                    >
                      Remove LTI 1.3 connection with ${instance.lti13_instance.name}:
                      ${instance.lti13_course_instance.context_label}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
