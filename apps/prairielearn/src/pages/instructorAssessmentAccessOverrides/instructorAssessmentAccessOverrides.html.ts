import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { Modal } from '../../components/Modal.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { DateFromISOString, IdSchema } from '../../lib/db-types.js';

export const AssessmentAccessPolicyRowSchema = z.object({
  // TODO: do date formatting in JS
  created_at: DateFromISOString,
  created_by: z.string(),
  credit: z.string(),
  end_date: DateFromISOString,
  note: z.string().nullable(),
  start_date: DateFromISOString,
  group_name: z.string().nullable(),
  student_uid: z.string().nullable(),
  id: IdSchema,
});
export type AssessmentAccessPolicyRow = z.infer<typeof AssessmentAccessPolicyRowSchema>;

export function InstructorAssessmentAccessOverrides({
  policies,
  timezone,
  resLocals,
}: {
  policies: AssessmentAccessPolicyRow[];
  timezone: string;
  resLocals: Record<string, any>;
}) {
  // TODO: inline the page name and such for the head/nav partials.
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", {
          ...resLocals,
          pageTitle: 'Access overrides',
        })}
        ${compiledScriptTag('instructorAssessmentAccessOverridesClient.ts')}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navSubPage: 'access_overrides',
        })}
        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div
              class="card-header bg-primary text-white d-flex align-items-center justify-content-between"
            >
              Access Overrides - ${resLocals.assessment.title}
              ${resLocals.authz_data.has_course_instance_permission_edit
                ? html`
                    <button
                      type="button"
                      class="btn btn-light"
                      data-toggle="modal"
                      data-target="#addPolicyModal"
                    >
                      Add <i class="fas fa-plus"></i>
                    </button>
                  `
                : ''}
            </div>
            <div class="table-responsive">
              <table class="table table-sm table-hover">
                <thead>
                  <tr>
                    <th>${resLocals.assessment.group_work ? 'Group Name' : 'Student UID'}</th>
                    <th>Created At</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Created By</th>
                    <th>Credit</th>
                    <th>Note</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${policies.map(
                    (policy) => html`
                      <tr>
                        <td>
                          ${resLocals.assessment.group_work
                            ? policy.group_name
                            : policy.student_uid}
                        </td>
                        <td>${formatDate(policy.created_at, timezone)}</td>
                        <td>${formatDate(policy.start_date, timezone)}</td>
                        <td>${formatDate(policy.end_date, timezone)}</td>
                        <td>${policy.created_by}</td>
                        <td>${policy.credit + '%'}</td>
                        <td>${policy.note ?? html`&mdash;`}</td>
                        <td>
                          ${resLocals.authz_data.has_course_instance_permission_edit
                            ? html`
                                <div class="dropdown js-question-actions">
                                  <button
                                    class="btn btn-xs btn-secondary dropdown-toggle"
                                    type="button"
                                    data-toggle="dropdown"
                                    data-container="body"
                                    data-html="true"
                                    aria-haspopup="true"
                                    aria-expanded="false"
                                    data-boundary="window"
                                  >
                                    Action
                                  </button>
                                  <div class="dropdown-menu">
                                    <button
                                      type="button"
                                      class="dropdown-item edit-override-button"
                                      data-toggle="modal"
                                      data-target="#editPolicyModal"
                                      data-user-uid="${policy.student_uid}"
                                      data-group-name="${policy.group_name}"
                                      data-credit="${policy.credit}"
                                      data-start-date="${formatDate(policy.start_date, timezone, {
                                        includeTz: false,
                                      })}"
                                      data-end-date="${formatDate(policy.end_date, timezone, {
                                        includeTz: false,
                                      })}"
                                      data-note="${policy.note}"
                                      data-policy-id="${policy.id}"
                                    >
                                      <i class="fas fa-edit"></i> Edit
                                    </button>

                                    <button
                                      type="button"
                                      class="dropdown-item delete-button"
                                      data-toggle="modal"
                                      data-target="#deleteModal"
                                      data-policy-id="${policy.id}"
                                    >
                                      <i class="fas fa-remove"></i> Delete
                                    </button>
                                  </div>
                                </div>
                              `
                            : ''}
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          </div>
          ${AddAccessOverrideModal({ timezone, resLocals })}
          ${EditAccessOverrideModal({ timezone, resLocals })}
          ${DeleteAccessOverrideModal({ resLocals })}
        </main>
      </body>
    </html>
  `.toString();
}

function AddAccessOverrideModal({
  timezone,
  resLocals,
}: {
  timezone: string;
  resLocals: Record<string, any>;
}) {
  // TODO: figure out how to handle templating of group name/UID with conditionally rendered inputs.
  return Modal({
    id: 'addPolicyModal',
    title: 'Add new access override',
    body: html`
      <div class="form-group ${resLocals.assessment.group_work ? '' : 'd-none'}">
        <label for="group_id">Group Name</label>
        <input type="text" class="form-control" id="group_name" name="group_name" required />
      </div>

      <div class="form-group ${resLocals.assessment.group_work ? 'd-none' : ''}">
        <label for="student_uid">Student UID</label>
        <input
          type="text"
          class="form-control"
          id="student_uid"
          name="student_uid"
          placeholder="student@example.com"
          required
        />
      </div>

      <div class="form-group">
        <label for="start_date">Start Date</label>
        <div class="input-group">
          <input
            type="datetime-local"
            class="form-control"
            id="start_date"
            name="start_date"
            step="1"
            required
          />
          <div class="input-group-append">
            <span class="input-group-text">(${timezone})</span>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label for="end_date">End Date</label>
        <div class="input-group">
          <input
            type="datetime-local"
            class="form-control"
            id="end_date"
            name="end_date"
            step="1"
            required
          />
          <div class="input-group-append">
            <span class="input-group-text">(${timezone})</span>
          </div>
        </div>
        <div id="end_date_error" class="invalid-feedback" style="display: none; color: red;"></div>
      </div>

      <div class="form-group">
        <label for="credit">Credit</label>
        <div class="input-group">
          <input type="number" class="form-control" id="credit" name="credit" min="0" required />
          <div class="input-group-append">
            <span class="input-group-text">%</span>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label for="note">Note</label>
        <textarea class="form-control" id="note" name="note"></textarea>
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="add_new_override" />
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      <button class="btn btn-primary">Add access override</button>
    `,
  });
}

function EditAccessOverrideModal({
  timezone,
  resLocals,
}: {
  timezone: string;
  resLocals: Record<string, any>;
}) {
  // TODO: figure out how to handle templating of group name/UID with conditionally rendered inputs.
  return Modal({
    id: 'editPolicyModal',
    title: 'Edit access override',
    body: html`
      <div class="form-group ${resLocals.assessment.group_work ? '' : 'd-none'}">
        <label for="group_name">Group Name</label>
        <input type="text" class="form-control" id="edit-group_name" name="group_name" />
        <div
          id="edit-group_name_error"
          class="invalid-feedback"
          style="display: none; color: red;"
        ></div>
      </div>

      <div class="form-group ${resLocals.assessment.group_work ? 'd-none' : ''}">
        <label for="student_uid">Student UID</label>
        <input type="text" class="form-control" id="edit-student_uid" name="student_uid" />
      </div>

      <div class="form-group">
        <label for="edit-start_date">Start Date</label>
        <div class="input-group">
          <input
            type="datetime-local"
            class="form-control"
            id="edit-start_date"
            name="start_date"
            step="1"
            required
          />
          <div class="input-group-append">
            <span class="input-group-text">(${timezone})</span>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label for="edit-end_date">End Date</label>
        <div class="input-group">
          <input
            type="datetime-local"
            class="form-control"
            id="edit-end_date"
            name="end_date"
            step="1"
            required
          />
          <div class="input-group-append">
            <span class="input-group-text">(${timezone})</span>
          </div>
        </div>
        <div
          id="edit-end_date_error"
          class="invalid-feedback"
          style="display: none; color: red;"
        ></div>
      </div>

      <div class="form-group">
        <label for="edit-credit">Credit</label>
        <input type="number" class="form-control" id="edit-credit" name="credit" />
      </div>

      <div class="form-group">
        <label for="edit-note">Note</label>
        <textarea class="form-control" id="edit-note" name="note"></textarea>
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="edit_override" />
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input type="hidden" name="policy_id" id="policy_id" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      <button class="btn btn-primary">Save</button>
    `,
  });
}

function DeleteAccessOverrideModal({ resLocals }: { resLocals: Record<string, any> }) {
  return Modal({
    id: 'deleteModal',
    title: 'Delete access override',
    body: html`<p>Are you sure you want to delete this access override?</p>`,
    footer: html`
      <input type="hidden" name="__action" value="delete_override" />
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input type="hidden" name="policy_id" class="js-policy-id" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <button class="btn btn-danger">Delete</button>
    `,
  });
}
