import { z } from 'zod';

import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { Modal } from '../../components/Modal.html.js';
import { compiledScriptTag } from '../../lib/assets.js';

export const AssessmentAccessRulesSchema = z.object({
  mode: z.string(),
  uids: z.string(),
  start_date: z.string(),
  end_date: z.string(),
  credit: z.string(),
  time_limit: z.string(),
  password: z.string(),
  exam_uuid: z.string().nullable(),
  pt_course_id: z.string().nullable(),
  pt_course_name: z.string().nullable(),
  pt_exam_id: z.string().nullable(),
  pt_exam_name: z.string().nullable(),
  active: z.string(),
});
type AssessmentAccessRules = z.infer<typeof AssessmentAccessRulesSchema>;

export function InstructorAssessmentAccess({
  resLocals,
  accessRules,
}: {
  resLocals: Record<string, any>;
  accessRules: AssessmentAccessRules[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", resLocals)}
        ${compiledScriptTag('instructorAssessmentAccessClient.js')}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            import.meta.url,
            "<%- include('../partials/assessmentSyncErrorsAndWarnings'); %>",
            resLocals,
          )}

          <div class="card mb-4">
            <div
              class="card-header bg-primary text-white d-flex align-items-center justify-content-between"
            >
              <div class="col-auto">
                ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Access
              </div>
              <div class="col-auto">
                <button id="enableEditButton" class="btn btn-sm btn-light">
                  <i class="fa fa-edit" aria-hidden="true"></i> Edit Access Rules
                </button>
                <button id="saveEditButton" class="btn btn-sm btn-light" style="display: none">
                  <i class="fa fa-save" aria-hidden="true"></i> Save and sync
                </button>
              </div>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover">
                <thead>
                  <tr id="tableHeaderRow">
                    <th>Mode</th>
                    <th>UIDs</th>
                    <th>Start date</th>
                    <th>End date</th>
                    <th>Active</th>
                    <th>Credit</th>
                    <th>Time limit</th>
                    <th>Password</th>
                    <th>PrairieTest</th>
                  </tr>
                </thead>
                <tbody>
                  ${accessRules.map((access_rule, i) => {
                    // Only users with permission to view student data are allowed
                    // to see the list of uids associated with an access rule. Note,
                    // however, that any user with permission to view course code
                    // (or with access to the course git repository) will be able to
                    // see the list of uids, because these access rules are defined
                    // in course code. This should be changed in future, to protect
                    // student data. See https://github.com/PrairieLearn/PrairieLearn/issues/3342
                    return html`
                      <tr class="tableDataRow">
                        ${resLocals.authz_data.has_course_instance_permission_edit
                          ? editAccessRuleModal({ access_rule, i })
                          : ''}
                        <td>${access_rule.mode}</td>
                        <td>
                          ${access_rule.uids === '—' ||
                          resLocals.authz_data.has_course_instance_permission_view
                            ? access_rule.uids
                            : html`
                                <a
                                  role="button"
                                  class="btn btn-xs btn-warning"
                                  tabindex="0"
                                  data-toggle="popover"
                                  data-trigger="focus"
                                  data-container="body"
                                  data-placement="auto"
                                  title="Hidden UIDs"
                                  data-content="This access rule is specific to individual students. You need permission to view student data in order to see which ones."
                                >
                                  Hidden
                                </a>
                              `}
                        </td>
                        <td>${access_rule.start_date}</td>
                        <td>${access_rule.end_date}</td>
                        <td>${access_rule.active}</td>
                        <td>${access_rule.credit}</td>
                        <td>${access_rule.time_limit}</td>
                        <td>${access_rule.password}</td>
                        <td>
                          ${access_rule.pt_exam_name
                            ? html`
                                <a
                                  href="${resLocals.config
                                    .ptHost}/pt/course/${access_rule.pt_course_id}/staff/exam/${access_rule.pt_exam_id}"
                                >
                                  ${access_rule.pt_course_name}: ${access_rule.pt_exam_name}
                                </a>
                              `
                            : access_rule.exam_uuid
                              ? resLocals.devMode
                                ? access_rule.exam_uuid
                                : html`
                                    <span class="text-danger">
                                      Exam not found: ${access_rule.exam_uuid}
                                    </span>
                                  `
                              : html`&mdash;`}
                        </td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
            <div class="card-footer">
              <small>
                Instructions on how to change the access rules can be found in the
                <a
                  href="https://prairielearn.readthedocs.io/en/latest/accessControl/"
                  target="_blank"
                  >PrairieLearn documentation</a
                >. Note that changing time limit rules does not affect assessments in progress; to
                change the time limit for these exams please visit the
                <a href="${resLocals.urlPrefix}/assessment/${resLocals.assessment.id}/instances"
                  >Students tab</a
                >.</small
              >
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function editAccessRuleModal({
  access_rule,
  i,
}: {
  access_rule: AssessmentAccessRules;
  i: number;
}) {
  return Modal({
    id: 'editAccessRuleModal',
    title: 'Edit Access Rule',
    body: html`
      <input type="hidden" name="access_rule_number" value="${i}" />
      <div class="form-group">
        <label for="mode">Mode</label>
        <select class="form-control" id="mode" name="mode">
          <option value="" ${access_rule.mode === '' ? html`selected` : ''}>—</option>
          <option value="Exam" ${access_rule.mode === 'Exam' ? html`selected` : ''}>Exam</option>
          <option value="Public" ${access_rule.mode === 'Public' ? html`selected` : ''}>
            Public
          </option>
        </select>
      </div>
      <div class="form-group">
        <label for="uids">UIDs</label>
        <input type="text" class="form-control" id="uids" name="uids" value="${access_rule.uids}" />
      </div>
      <div class="form-group">
        <label for="start_date">Start date</label>
        <input
          type="text"
          class="form-control"
          id="start_date"
          name="start_date"
          value=${access_rule.start_date}
        />
      </div>
      <div class="form-group">
        <label for="end_date">End date</label>
        <input
          type="text"
          class="form-control"
          id="end_date"
          name="end_date"
          value="${access_rule.end_date}"
        />
      </div>
      <div class="form-group">
        <label for="active">Active</label>
        <select class="form-control" id="active" name="active">
          <option value="true" ${access_rule.active === 'True' ? html`selected` : ''}>True</option>
          <option value="false">False</option>
        </select>
      </div>
      <div class="form-group">
        <label for="credit">Credit</label>
        <input
          type="text"
          class="form-control"
          id="credit"
          name="credit"
          value="${access_rule.credit}"
        />
      </div>
      <div class="form-group">
        <label for="time_limit">Time limit</label>
        <input
          type="text"
          class="form-control"
          id="time_limit"
          name="time_limit"
          value="${access_rule.time_limit}"
        />
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input
          type="text"
          class="form-control"
          id="password"
          name="password"
          value="${access_rule.password}"
        />
      </div>
    `,
    footer: html`
      <button
        type="button"
        class="btn btn-primary"
        id="updateAccessRuleButton"
        data-row-number="${i}"
      >
        Update Access Rule
      </button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
    `,
  });
}
