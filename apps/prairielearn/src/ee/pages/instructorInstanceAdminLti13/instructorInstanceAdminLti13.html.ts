import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Modal } from '../../../components/Modal.html.js';
import {
  Lti13CourseInstance,
  Lti13Instance,
  AssessmentSchema,
  AssessmentSetSchema,
  Lti13Lineitems,
} from '../../../lib/db-types.js';
import { Lti13LineitemType } from '../../lib/lti13.js';

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
  lineitems: Lti13Lineitems[];
}): string {
  const { urlPrefix } = resLocals;
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
                    <li><a href="#assessments">Linked Assessments</a></li>
                    <li><a href="#connection">Connection to LMS</a></li>
                  </ul>
                  Created at: ${instance.lti13_course_instance.created_at.toDateString()}
                </div>
                <div class="col-10">
                  <h3 id="assessments">Linked Assessments</h3>

                  <form method="POST">
                    <input type="hidden" name="__action" value="poll_lti13_assessments" />
                    <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                    <button class="btn btn-success">
                      Poll ${lms_name} external assessment info
                    </button>
                  </form>

                  <div class="table-responsive">
                    <table class="table table-sm table-hover">
                      <thead>
                        <tr>
                          <th colspan="2">PrairieLearn Assessment</th>
                          <th>Actions</th>
                          <th colspan="2">${lms_name} Assignment</th>
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
                                    <th colspan="2">${row.assessment_group_heading}</th>
                                    <th colspan="3">
                                      <button class="btn btn-sm btn-secondary">Bulk actions</button>
                                    </th>
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
                              <td>
                                ${Modal({
                                  body: html`<p>Which ${lms_name} assignment should we link?</p>
                                    <form method="POST">
                                      <input
                                        type="hidden"
                                        name="__action"
                                        value="lineitem_configure"
                                      />
                                      <input
                                        type="hidden"
                                        name="__csrf_token"
                                        value="${resLocals.__csrf_token}"
                                      />
                                      <input type="hidden" name="assessment_id" value="${row.id}" />
                                      <button class="btn btn-success" name="create_new" value="1">
                                        Create a new assignment named ${row.label}: ${row.title}
                                      </button>
                                      <button
                                        class="btn btn-info"
                                        hx-get="?lineitems"
                                        hx-swap="afterend"
                                      >
                                        Pick from existing ${lms_name} assignments
                                      </button>
                                    </form> `,
                                  footer: html`<button
                                    type="button"
                                    class="btn btn-secondary"
                                    data-dismiss="modal"
                                  >
                                    Close
                                  </button>`,
                                  id: `assignment-${row.id}`,
                                  title: `Configure ${row.title} in ${instance.lti13_course_instance.context_label}`,
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
                                        <!--
                                    <button
                                          class="btn btn-sm btn-success"
                                          name="__action"
                                          value="create_lineitem"
                                        >
                                          Create ${instance.lti13_course_instance.context_label}
                                          assignment
                                        </button>
                                        -->
                                        <button
                                          class="btn btn-med-light"
                                          type="button"
                                          data-toggle="modal"
                                          data-target="#assignment-${row.id}"
                                        >
                                          Configure
                                        </button>
                                      `
                                    : html`
                                        <button
                                          class="btn btn-info"
                                          name="__action"
                                          value="send_grades"
                                          onClick="event.preventDefault();alert('Coming soon &#128512;');"
                                        >
                                          Send grades to ${lms_name}
                                        </button>
                                        <div class="dropdown js-question-actions">
                                          <button
                                            type="button"
                                            class="btn btn-xs dropdown-toggle"
                                            data-toggle="dropdown"
                                            aria-haspopup="true"
                                            aria-expanded="false"
                                          >
                                            ...<span class="caret"></span>
                                          </button>

                                          <div class="dropdown-menu">
                                            <button
                                              class="dropdown-item"
                                              type="button"
                                              data-toggle="modal"
                                              data-target="#assignment-${row.id}"
                                            >
                                              Link assignment
                                            </button>
                                          </div>
                                        </div>
                                      `}
                                </form>
                              </td>
                              <td>
                                ${lineitems_linked.map((item) =>
                                  lineItem(item, resLocals.__csrf_token),
                                )}
                              </td>
                              <td class="text-right">
                                <div class="dropdown js-question-actions">
                                  <button
                                    type="button"
                                    class="btn btn-secondary btn-xs dropdown-toggle"
                                    data-toggle="dropdown"
                                    aria-haspopup="true"
                                    aria-expanded="false"
                                  >
                                    Action <span class="caret"></span>
                                  </button>

                                  <div class="dropdown-menu">
                                    <button
                                      class="dropdown-item"
                                      type="button"
                                      data-toggle="modal"
                                      data-target="#assignment-${row.id}"
                                    >
                                      Link assignment
                                    </button>
                                  </div>
                                </div>
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

function lineItem(item: Lti13Lineitems, csrf: string, assessments: AssessmentRow[] = []) {
  const inputUuid = uuidv4();
  return html`
    <form method="POST">
      <input type="hidden" name="__csrf_token" value="${csrf}" />
      <input type="hidden" name="lineitem_id" value="${item.lineitem_id}" />
      <span title="${item.lineitem_id}">${item.lineitem.label}</span>
      ${item.assessment_id
        ? ''
        : html`<div class="input-group">
            <div class="input-group-prepend">
              <label class="input-group-text" for="${inputUuid}">
                Associate ${item.lineitem.label} with
              </label>
            </div>
            <select name="assessment_id" class="custom-select" id="${inputUuid}">
              <option selected disabled>Pick a PrairieLearn assessment...</option>
              ${assessments.map((a) => {
                return html`<option value="${a.id}">${a.label}: ${a.title}</option>`;
              })}
            </select>
            <div class="input-group-append">
              <button class="btn btn-info" name="__action" value="associate_lineitem">
                Associate
              </button>
            </div>
          </div> `}
      <button
        class="btn btn-xs"
        onClick="event.preventDefault();$(this).next('.lineitem-detail').toggle();"
      >
        ...
      </button>
      <div class="lineitem-detail" style="display:none;">
        <button class="btn btn-xs btn-warning" name="__action" value="disassociate_lineitem">
          Disassociate
        </button>
        <button class="btn btn-xs btn-danger" name="__action" value="delete_lineitem">
          Delete from LMS
        </button>
        <pre>${JSON.stringify(item, null, 2)}</pre>
      </div>
    </form>
  `;
}

export function LineitemsInputs(lineitems: Lti13LineitemType[]) {
  if (lineitems.length === 0) {
    return html`<p>None found.</p>`.toString();
  }
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
            />
            ${lineitem.label}
          </label>
        </div>
      `,
    )}
    <button class="btn btn-primary">Link assignments</button>
  `.toString();
}
