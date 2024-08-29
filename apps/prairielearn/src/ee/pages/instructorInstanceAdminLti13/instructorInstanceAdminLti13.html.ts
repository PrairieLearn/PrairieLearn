import { z } from 'zod';

import { formatDateYMDHM } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Modal } from '../../../components/Modal.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import {
  Lti13CourseInstance,
  Lti13Instance,
  AssessmentSchema,
  AssessmentSetSchema,
  Lti13Assessments,
} from '../../../lib/db-types.js';
import { Lineitems } from '../../lib/lti13.js';

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
  lineitems,
}: {
  resLocals: Record<string, any>;
  instance: Lti13FullInstance;
  instances: Lti13FullInstance[];
  assessments: AssessmentRow[];
  lineitems: Lti13Assessments[];
}): string {
  const { urlPrefix } = resLocals;
  const { assessments_group_by } = resLocals.course_instance;
  const lms_name = `${instance.lti13_instance.name}: ${instance.lti13_course_instance.context_label}`;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
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
        ${Navbar({ resLocals, navSubPage: 'lti13' })}
        <main id="content" class="container-fluid mb-4">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex">
              <h1>LTI 1.3 configuration</h1>
            </div>
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
                    <li><a href="#assessments">Linked Assessments</a></li>
                    <li><a href="#connection">Connection to LMS</a></li>
                  </ul>
                  Created at:
                  ${formatDateYMDHM(
                    instance.lti13_course_instance.created_at,
                    resLocals.course_instance.display_timezone,
                  )}
                </div>
                <div class="col-10">
                  <h3 id="assessments">Linked Assessments</h3>
                  <div class="table-responsive">
                    <table class="table table-sm table-hover">
                      <thead>
                        <tr>
                          <th colspan="2" scope="row">PrairieLearn Assessment</th>
                          <th>Actions</th>
                          <th>
                            <form method="POST">
                              <input type="hidden" name="__action" value="poll_lti13_assessments" />
                              <input
                                type="hidden"
                                name="__csrf_token"
                                value="${resLocals.__csrf_token}"
                              />
                              ${lms_name} Assignment
                              <button class="btn btn-success btn-xs">Sync metadata</button>
                            </form>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        ${assessments.map((row) => {
                          const lineitems_linked = lineitems.filter((item) => {
                            return item.assessment_id === row.id;
                          });
                          return html`
                            ${row.start_new_assessment_group
                              ? html`
                                  <tr>
                                    <th colspan="5">
                                      ${Modal({
                                        id: `bulk-${row.assessment_set_id}-${row.assessment_module_id}`,
                                        title: `${row.assessment_group_heading} ${assessments_group_by} Bulk Actions`,
                                        body: html`<p>
                                            These bulk actions work collectively on every assessment
                                            in the group where the action makes sense.
                                          </p>

                                          <form method="POST">
                                            <input
                                              type="hidden"
                                              name="__csrf_token"
                                              value="${resLocals.__csrf_token}"
                                            />

                                            <input
                                              type="hidden"
                                              name="assessment_set_id"
                                              value="${row.assessment_set_id}"
                                            />
                                            <input
                                              type="hidden"
                                              name="assessment_module_id"
                                              value="${row.assessment_module_id}"
                                            />

                                            <button
                                              class="btn btn-success"
                                              name="__action"
                                              value="bulk_create_assessments"
                                              onClick="return confirm('Are you sure?');"
                                            >
                                              Create and link assignments in ${lms_name}
                                            </button>
                                            that aren't already linked.
                                            <br />
                                            <button
                                              class="btn btn-med-light"
                                              name="__action"
                                              value="bulk_unlink_assessments"
                                              onClick="return confirm('Are you sure?');"
                                            >
                                              Unlink assessments
                                            </button>
                                            that are linked.
                                          </form>`,
                                        footer: html`<button
                                          type="button"
                                          class="btn btn-secondary"
                                          data-dismiss="modal"
                                        >
                                          Close
                                        </button>`,
                                      })}
                                      ${row.assessment_group_heading}
                                      <button
                                        class="btn btn-sm btn-secondary ml-2"
                                        type="button"
                                        data-toggle="modal"
                                        data-target="#bulk-${row.assessment_set_id}-${row.assessment_module_id}"
                                      >
                                        Bulk actions
                                      </button>
                                    </th>
                                  </tr>
                                `
                              : ''}
                            <tr id="row-${row.id}">
                              <td class="align-middle" style="width: 1%">
                                <span class="badge color-${row.color}">${row.label}</span>
                              </td>
                              <td class="align-middle">
                                <a href="${urlPrefix}/assessment/${row.id}/"
                                  >${row.title}
                                  ${row.group_work
                                    ? html` <i class="fas fa-users" aria-hidden="true"></i> `
                                    : ''}</a
                                >
                              </td>
                              <td>
                                ${Modal({
                                  body: html`
                                    <p>Which ${lms_name} assignment should we link?</p>
                                    <form method="POST">
                                      <input
                                        type="hidden"
                                        name="__csrf_token"
                                        value="${resLocals.__csrf_token}"
                                      />
                                      <input type="hidden" name="assessment_id" value="${row.id}" />
                                      <button
                                        class="btn btn-success"
                                        name="__action"
                                        value="create_link_assessment"
                                      >
                                        Create a new assignment named ${row.label}: ${row.title}
                                      </button>
                                    </form>
                                    <form method="POST">
                                      <input
                                        type="hidden"
                                        name="__csrf_token"
                                        value="${resLocals.__csrf_token}"
                                      />
                                      <input type="hidden" name="assessment_id" value="${row.id}" />
                                      <button
                                        class="btn btn-info"
                                        hx-get="?lineitems"
                                        hx-swap="afterend"
                                      >
                                        Pick from existing ${lms_name} assignments
                                      </button>
                                    </form>
                                  `,
                                  footer: html`<button
                                    type="button"
                                    class="btn btn-secondary"
                                    data-dismiss="modal"
                                  >
                                    Close
                                  </button>`,
                                  id: `assignment-${row.id}`,
                                  title: `Configure ${row.title} in ${lms_name}`,
                                })}

                                <form method="POST">
                                  <input
                                    type="hidden"
                                    name="__csrf_token"
                                    value="${resLocals.__csrf_token}"
                                  />
                                  <input type="hidden" name="assessment_id" value="${row.id}" />
                                  ${lineitems_linked.length === 0
                                    ? html`
                                        <button
                                          class="btn btn-med-light"
                                          type="button"
                                          data-toggle="modal"
                                          data-target="#assignment-${row.id}"
                                        >
                                          Link assignment
                                        </button>
                                      `
                                    : html`
                                        <button
                                          class="btn btn-info"
                                          name="__action"
                                          value="send_grades"
                                          onClick="event.preventDefault();alert('Coming soon &#128512;');"
                                        >
                                          Send grades
                                        </button>
                                        <span class="dropdown js-question-actions">
                                          <button
                                            type="button"
                                            class="btn btn-xs btn-light dropdown-toggle"
                                            data-toggle="dropdown"
                                            aria-haspopup="true"
                                            aria-expanded="false"
                                          >
                                            ...<span class="caret"></span>
                                          </button>

                                          <div class="dropdown-menu">
                                            <button
                                              class="dropdown-item"
                                              name="__action"
                                              value="unlink_assessment"
                                            >
                                              Unlink assignment
                                            </button>
                                          </div>
                                        </span>
                                      `}
                                </form>
                              </td>
                              <td class="align-middle">
                                ${lineitems_linked.map((i) =>
                                  lineItem(i, resLocals.course_instance.display_timezone),
                                )}
                              </td>
                            </tr>
                          `;
                        })}
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

function lineItem(item: Lti13Assessments, timezone: string) {
  return html`
    <span title="${item.lineitem_id_url}">${item.lineitem.label}</span>
    <p>
      <em>Last activity: ${formatDateYMDHM(item.last_activity, timezone)}</em>
    </p>
  `;
}

export function LineitemsInputs(lineitems: Lineitems) {
  if (lineitems.length === 0) {
    return html`<p>None found.</p>`.toString();
  }
  // TODO: Filter out assignments that are already linked? Re-linking will override the
  // previous assignment link
  return html`
    ${lineitems.map(
      (lineitem) => html`
        <div class="form-check">
          <label class="form-check-label">
            <input
              class="form-check-input"
              type="radio"
              name="lineitem_id"
              value="${lineitem.id}"
              required
            />
            <span title="${lineitem.id}">${lineitem.label}</span>
          </label>
        </div>
      `,
    )}
    <button name="__action" value="link_assessment" class="btn btn-primary">
      Link assignments
    </button>
  `.toString();
}
