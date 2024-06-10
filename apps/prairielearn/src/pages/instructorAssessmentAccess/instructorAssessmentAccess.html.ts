import { EncodedData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { Modal } from '../../components/Modal.html.js';
import { compiledScriptTag } from '../../lib/assets.js';

import { AccessRulesTable } from './accessRulesTable.js';
import { AssessmentAccessRules } from './instructorAssessmentAccess.types.js';

export function InstructorAssessmentAccess({
  resLocals,
  accessRules,
  origHash,
  timezone,
}: {
  resLocals: Record<string, any>;
  accessRules: AssessmentAccessRules[];
  origHash: string;
  timezone: string;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", resLocals)}
        ${compiledScriptTag('instructorAssessmentAccessClient.js')}
      </head>
      <body>
        ${EncodedData(accessRules, 'access-rules-data')}
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
          ${EditAccessRuleModal({
            accessRule: accessRules[0] ?? { assessment_access_rule: {} },
            timeZoneName: timezone,
          })}
          <div class="js-delete-access-rule-modal"></div>
          <form method="POST" id="accessRulesForm">
            <input type="hidden" name="__action" value="edit_access_rules" />
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <input type="hidden" name="__orig_hash" value="${origHash}" />
            <input
              type="hidden"
              name="assessment_access_rules"
              value="${JSON.stringify(accessRules)}"
            />
          </form>
          <div class="card mb-4">
            <div
              class="card-header bg-primary text-white d-flex align-items-center justify-content-between"
            >
              <div>${resLocals.assessment_set.name} ${resLocals.assessment.number}: Access</div>
              ${resLocals.authz_data.has_course_instance_permission_edit
                ? html`
                    <div class="ml-auto">
                      <button id="enableEditButton" class="btn btn-sm btn-light">
                        <i class="fa fa-edit" aria-hidden="true"></i> Edit Access Rules
                      </button>
                      <span id="editModeButtons" style="display: none">
                        <button id="saveAndSyncButton" class="btn btn-sm btn-light" type="button">
                          <i class="fa fa-save" aria-hidden="true"></i> Save and sync
                        </button>
                        <button class="btn btn-sm btn-light" onclick="window.location.reload()">
                          Cancel
                        </button>
                      </span>
                    </div>
                  `
                : ''}
            </div>
            ${AccessRulesTable({
              accessRules,
              ptHost: resLocals.config.ptHost,
              devMode: resLocals.devMode,
              hasCourseInstancePermissionView:
                resLocals.authz_data.has_course_instance_permission_view,
              editMode: false,
              timezone: resLocals.course_instance.display_timezone,
            })}
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

function EditAccessRuleModal({
  accessRule,
  timeZoneName,
}: {
  accessRule: AssessmentAccessRules;
  timeZoneName: string;
}) {
  return Modal({
    id: `editAccessRuleModal`,
    title: '',
    body: html`
      <div class="form-group">
        <input type="hidden" name="row" class="access-rule-row" />
        <label for="mode">Mode</label>
        <select
          class="form-control access-rule-mode"
          id="mode"
          name="mode"
          aria-describedby="modeHelp"
        >
          <option value="" ${accessRule.assessment_access_rule.mode === null ? 'selected' : ''}>
            —
          </option>
          <option
            value="Exam"
            ${accessRule.assessment_access_rule.mode === 'Exam' ? 'selected' : ''}
          >
            Exam
          </option>
          <option
            value="Public"
            ${accessRule.assessment_access_rule.mode === 'Public' ? 'selected' : ''}
          >
            Public
          </option>
        </select>
        <small id="modeHelp" class="form-text text-muted">
          Used to restrict access to assessments based on the current mode. In general, it is best
          to use "Public" for any homework and "Exam" for exams proctored with PrairieTest. (See the
          <a
            href="https://prairielearn.readthedocs.io/en/latest/accessControl/#server-modes"
            target="_blank"
            >documentation</a
          >
          for more information.)
        </small>
      </div>
      <div class="form-group">
        <label for="uids">UIDs</label>
        <input
          type="text"
          class="form-control access-rule-uids"
          id="uids"
          name="uids"
          aria-describedby="uidHelp"
        />
        <small id="uidHelp" class="form-text text-muted">
          Require one of the UIDs in the array to access. Enter UIDs separated by commas or leave
          blank to allow all enrolled students to access.
        </small>
      </div>
      <div class="form-group">
        <label for="start_date">Start date</label>
        <div class="input-group">
          <input
            type="datetime-local"
            step="1"
            class="form-control access-rule-start-date"
            id="start_date"
            name="start_date"
            aria-describedby="startDateHelp"
          />
          <div class="input-group-append">
            <span id="startDateHelp" class="input-group-text">${timeZoneName}</span>
          </div>
        </div>
        <small class="form-text text-muted">
          Only allow access after this date. All times are in the timezone of the course
          instance.</small
        >
      </div>
      <div class="form-group">
        <label for="end_date">End date</label>
        <div class="input-group">
          <input
            type="datetime-local"
            step="1"
            class="form-control access-rule-end-date"
            id="end_date"
            name="end_date"
            aria-describedby="endDateHelp"
          />
          <div class="input-group-append">
            <span class="input-group-text">${timeZoneName}</span>
          </div>
        </div>
        <small id="endDateHelp" class="form-text text-muted">
          Only allow access before this date. All times are in the timezone of the course
          instance.</small
        >
      </div>
      <div class="form-group">
        <label for="active">Active</label>
        <select
          class="form-control access-rule-active"
          id="active"
          name="active"
          aria-describedby="activeHelp"
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
        <small id="activeHelp" class="form-text text-muted">
          Whether the student can create a new assessment instance and submit answers to questions.
        </small>
      </div>
      <div class="form-group">
        <label for="credit">Credit</label>
        <div class="input-group">
          <input
            type="text"
            class="form-control access-rule-credit"
            id="credit"
            name="credit"
            aria-describedby="creditHelp"
          />
          <div class="input-group-append">
            <span class="input-group-text">%</span>
          </div>
        </div>
        <small id="creditHelp" class="form-text text-muted">
          Maximum credit as percentage of full credit (can be more than 100).
        </small>
      </div>
      <div class="form-group">
        <label for="time_limit_min">Time limit</label>
        <div class="input-group">
          <input
            type="text"
            class="form-control access-rule-time-limit"
            id="time_limit_min"
            name="time_limit_min"
            aria-describedby="timeLimitHelp"
          />
          <div class="input-group-append">
            <span class="input-group-text">mins</span>
          </div>
        </div>
        <small id="timeLimitHelp" class="form-text text-muted">
          Time limit in minutes to complete an assessment.
        </small>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input
          type="text"
          class="form-control access-rule-password"
          id="password"
          name="password"
          aria-describedby="passwordHelp"
        />
        <small id="passwordHelp" class="form-text text-muted">
          Password required to start an assessment.
        </small>
      </div>
      <div class="form-group">
        <label for="exam_uuid">PrairieTest Exam UUID</label>
        <input
          type="text"
          class="form-control access-rule-exam-uuid"
          id="exam_uuid"
          name="exam_uuid"
          aria-describedby="examUuidHelp"
        />
        <small id="examUuidHelp" class="form-text text-muted">
          Links this assessment to a PrairieTest exam.
        </small>
      </div>
    `,
    footer: html`
      <button
        type="button"
        class="btn btn-primary updateAccessRuleButton"
        id="updateAccessRuleButton"
        data-dismiss="modal"
      ></button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
    `,
  });
}
