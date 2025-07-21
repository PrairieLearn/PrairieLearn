import { type z } from 'zod';

import { formatDateYMDHM } from '@prairielearn/formatter';
import { type HtmlSafeString, html } from '@prairielearn/html';

import { AssessmentBadge } from '../../../components/AssessmentBadge.js';
import { Modal } from '../../../components/Modal.js';
import { PageLayout } from '../../../components/PageLayout.js';
import {
  Lti13AssessmentSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  type Lti13Assessment,
  type Lti13Instance,
} from '../../../lib/db-types.js';
import { type AssessmentRow, AssessmentRowSchema } from '../../../models/assessment.js';
import { LineitemSchema, type Lti13CombinedInstance } from '../../lib/lti13.js';

export const LineItemsRowSchema = LineitemSchema.extend({
  assessment: AssessmentRowSchema.optional(),
  lti13_assessment: Lti13AssessmentSchema.optional(),
});
export type LineItemsRow = z.infer<typeof LineItemsRowSchema>;

export const AssessmentLti13AssessmentRowSchema = AssessmentRowSchema.extend({
  lti13_assessment: Lti13AssessmentSchema.optional(),
});
export type AssessmentLti13AssessmentRowSchema = z.infer<typeof AssessmentLti13AssessmentRowSchema>;

export function InstructorInstanceAdminLti13NoInstances({
  resLocals,
  lti13_instances,
}: {
  resLocals: Record<string, any>;
  lti13_instances: Lti13Instance[];
}): string {
  return PageLayout({
    resLocals,
    pageTitle: 'Integrations',
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'integrations',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Integrations with other learning systems</h1>
        </div>
        <div class="card-body">
          ${lti13_instances.length === 0
            ? html`
                <p>
                  No learning management systems (LMSes) at your institution are available for
                  integration with PrairieLearn. Please contact your IT administrators to set up an
                  integration. You can refer them to the
                  <a target="_blank" href="https://prairielearn.readthedocs.io/en/latest/lti13/"
                    >documentation</a
                  >.
                </p>
              `
            : html`
                <p>
                  The following learning management systems (LMSes) at your institution are
                  available for integration with PrairieLearn:
                </p>

                <ul>
                  ${lti13_instances.map((i) => {
                    return html`<li>${i.name}</li>`;
                  })}
                </ul>
                <p>
                  <a
                    target="_blank"
                    href="https://prairielearn.readthedocs.io/en/latest/lmsIntegrationInstructor/"
                  >
                    How can I integrate my course with an LMS?
                  </a>
                </p>
              `}
          <p class="mb-0">
            Integrating will allow you to push assessment scores from PrairieLearn to the LMS.
          </p>
        </div>
      </div>
    `,
  });
}

export function InstructorInstanceAdminLti13({
  resLocals,
  instance,
  instances,
  assessments,
  assessmentsGroupBy,
}: {
  resLocals: Record<string, any>;
  instance: Lti13CombinedInstance;
  instances: Lti13CombinedInstance[];
  assessments: AssessmentRow[];
  assessmentsGroupBy: 'Set' | 'Module';
}): string {
  const lms_name = `${instance.lti13_instance.name}: ${instance.lti13_course_instance.context_label}`;

  return PageLayout({
    resLocals,
    pageTitle: 'Integrations',
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'integrations',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex">
          <h1>LTI 1.3 configuration</h1>
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-2">
              <div class="dropdown mb-2">
                <button
                  type="button"
                  class="btn dropdown-toggle border border-gray w-100 text-start pe-4"
                  data-bs-toggle="dropdown"
                  aria-haspopup="true"
                  aria-expanded="false"
                  data-bs-boundary="window"
                >
                  <span class="d-inline-block text-wrap w-100">
                    ${instance.lti13_instance.name}: ${instance.lti13_course_instance.context_label}
                  </span>
                </button>
                <div class="dropdown-menu">
                  ${instances.map((i) => {
                    return html`
                      <a
                        class="dropdown-item ${instance.lti13_course_instance.id ===
                        i.lti13_course_instance.id
                          ? 'active'
                          : ''}"
                        href="/pl/course_instance/${resLocals.course_instance
                          .id}/instructor/instance_admin/lti13_instance/${i.lti13_course_instance
                          .id}"
                        aria-current="${instance.lti13_course_instance.id ===
                        i.lti13_course_instance.id
                          ? 'true'
                          : ''}"
                      >
                        ${i.lti13_instance.name}: ${i.lti13_course_instance.context_label}
                      </a>
                    `;
                  })}
                </div>
              </div>
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
              ${instance.lti13_course_instance.context_memberships_url &&
              instance.lti13_course_instance.lineitems_url
                ? LinkedAssessments({
                    resLocals,
                    lms_name,
                    assessments,
                    assessmentsGroupBy,
                    lti13_course_instance_id: instance.lti13_course_instance.id,
                  })
                : html`
                    <p>
                      PrairieLearn does not have enough LTI metadata to link assignments and do
                      grade passback.
                    </p>
                    <p>
                      To update our metadata, go back to the LMS and initiate a PrairieLearn
                      connection via LTI as an instructor, then return here.
                    </p>
                  `}

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
    `,
  });
}

function LinkedAssessments({
  resLocals,
  lms_name,
  assessments,
  assessmentsGroupBy,
  lti13_course_instance_id,
}: {
  resLocals: Record<string, any>;
  lms_name: string;
  assessments: AssessmentLti13AssessmentRowSchema[];
  assessmentsGroupBy: 'Set' | 'Module';
  lti13_course_instance_id: string;
}): HtmlSafeString {
  const { urlPrefix } = resLocals;

  return html`
    <div class="table-responsive">
      <table class="table table-sm table-hover">
        <thead>
          <tr>
            <th colspan="2" scope="row">PrairieLearn Assessment</th>
            <th>Actions</th>
            <th>
              <form method="POST">
                <input type="hidden" name="__action" value="poll_lti13_assessments" />
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                ${lms_name} Assignment
                <button class="btn btn-success btn-xs">Sync metadata</button>
              </form>
            </th>
          </tr>
        </thead>
        <tbody>
          ${assessments.map((row) => {
            return html`
              ${row.start_new_assessment_group
                ? html`
                    <tr>
                      <th colspan="5">
                        ${Modal({
                          id: `bulk-${row.assessment_set_id}-${row.assessment_module_id}`,
                          title: `${
                            assessmentsGroupBy === 'Set'
                              ? row.assessment_set.heading
                              : row.assessment_module.heading
                          } ${assessmentsGroupBy} Bulk Actions`,
                          body: html`<p>
                              These bulk actions work collectively on every assessment in the group
                              where the action makes sense.
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
                            data-bs-dismiss="modal"
                          >
                            Close
                          </button>`,
                        })}
                        ${assessmentsGroupBy === 'Set'
                          ? row.assessment_set.heading
                          : row.assessment_module.heading}
                        <button
                          class="btn btn-sm btn-secondary ms-2"
                          type="button"
                          data-bs-toggle="modal"
                          data-bs-target="#bulk-${row.assessment_set_id}-${row.assessment_module_id}"
                        >
                          Bulk actions
                        </button>
                      </th>
                    </tr>
                  `
                : ''}
              <tr id="row-${row.id}">
                <td class="align-middle" style="width: 1%">
                  ${AssessmentBadge({
                    assessment: {
                      assessment_id: row.id,
                      color: row.assessment_set.color,
                      label: row.label,
                    },
                    urlPrefix,
                    hideLink: true,
                  })}
                </td>
                <td class="align-middle">
                  ${AssessmentLink({
                    assessment: row,
                    urlPrefix,
                  })}
                </td>
                <td>
                  ${Modal({
                    size: 'modal-xl',
                    body: html`
                      <p>Which ${lms_name} assignment should we link?</p>
                      <form method="POST">
                        <input
                          type="hidden"
                          name="__csrf_token"
                          value="${resLocals.__csrf_token}"
                        />
                        <input type="hidden" name="unsafe_assessment_id" value="${row.id}" />
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
                        <input type="hidden" name="unsafe_assessment_id" value="${row.id}" />
                        <button
                          class="btn btn-primary"
                          hx-get="?lineitems"
                          hx-target="next .line-items-inputs"
                          onClick="this.querySelector('.refresh-button').classList.remove('d-none');"
                        >
                          Pick from existing ${lms_name} assignments
                          <span class="refresh-button d-none"><i class="fa fa-refresh"></i></span>
                        </button>
                        <div class="line-items-inputs"></div>
                      </form>
                    `,
                    footer: html`<button
                      type="button"
                      class="btn btn-secondary"
                      data-bs-dismiss="modal"
                    >
                      Close
                    </button>`,
                    id: `assignment-${row.id}`,
                    title: `Configure ${row.title} in ${lms_name}`,
                  })}

                  <form method="POST">
                    <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                    <input type="hidden" name="unsafe_assessment_id" value="${row.id}" />
                    ${row.lti13_assessment
                      ? html`
                          <div class="btn-group">
                            <button class="btn btn-info" name="__action" value="send_grades">
                              Send grades
                            </button>
                            <button
                              type="button"
                              class="btn btn-info dropdown-toggle dropdown-toggle-split"
                              data-bs-toggle="dropdown"
                              aria-expanded="false"
                              aria-label="Toggle dropdown"
                            ></button>
                            <ul class="dropdown-menu">
                              <li>
                                <button
                                  class="dropdown-item"
                                  name="__action"
                                  value="unlink_assessment"
                                >
                                  Unlink assignment
                                </button>
                              </li>
                            </ul>
                          </div>
                        `
                      : html`
                          <button
                            class="btn btn-med-light"
                            type="button"
                            data-bs-toggle="modal"
                            data-bs-target="#assignment-${row.id}"
                          >
                            Link assignment
                          </button>
                        `}
                  </form>

                  <a href="${lti13_course_instance_id}/assessment/${row.id}" class="btn btn-primary"
                    >New UI</a
                  >
                </td>
                <td class="align-middle">
                  ${row.lti13_assessment
                    ? LineItem({
                        item: row.lti13_assessment,
                        timezone: resLocals.course_instance.display_timezone,
                      })
                    : ''}
                </td>
              </tr>
            `;
          })}
        </tbody>
      </table>
    </div>
  `;
}

function LineItem({ item, timezone }: { item: Lti13Assessment; timezone: string }) {
  return html`
    <span title="${item.lineitem_id_url}">${item.lineitem.label}</span>
    <p>
      <em>Last activity: ${formatDateYMDHM(item.last_activity, timezone)}</em>
    </p>
  `;
}

export function LineitemsInputs({
  lineitems,
  urlPrefix,
}: {
  lineitems: LineItemsRow[];
  urlPrefix: string;
}): string {
  const disclaimer = html`
    <details>
      <summary>Why don't I see my assignment here?</summary>
      <p>
        PrairieLearn can only poll for assignments in the LMS that are associated with PrairieLearn.
      </p>
      <p>
        In Canvas, edit the assignment Submission Type to "External Tool" and set the External Tool
        URL to the students' link to the assessment. (You can get this from the assessment
        instructor settings page.) Then, return here and refresh the listing.
      </p>
    </details>
  `;
  if (lineitems.length === 0) {
    return html`
      <p>None found.</p>
      ${disclaimer}
    `.toString();
  }
  return html`
    <table class="table w-auto">
      <tr>
        <th>Assignment</th>
        <th colspan="2">Linked PrairieLearn assessment</th>
      </tr>
      ${lineitems.map(
        (lineitem) => html`
          <tr>
            <td>
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
            </td>
            <td style="width: 1%">
              ${lineitem.assessment
                ? AssessmentBadge({
                    assessment: {
                      assessment_id: lineitem.assessment.id,
                      color: lineitem.assessment.assessment_set.color,
                      label: lineitem.assessment.label,
                    },
                    urlPrefix,
                    hideLink: true,
                  })
                : ''}
            </td>
            <td>
              ${lineitem.assessment
                ? AssessmentLink({
                    assessment: lineitem.assessment,
                    urlPrefix,
                  })
                : ''}
            </td>
          </tr>
        `,
      )}
    </table>
    <button name="__action" value="link_assessment" class="btn btn-primary">Link assignment</button>
    ${disclaimer}
  `.toString();
}

function AssessmentLink({
  assessment,
  urlPrefix,
}: {
  assessment: AssessmentRow;
  urlPrefix: string;
}) {
  return html`
    <a href="${urlPrefix}/assessment/${assessment.id}/"
      >${assessment.title}
      ${assessment.group_work ? html` <i class="fas fa-users" aria-hidden="true"></i> ` : ''}</a
    >
  `;
}
