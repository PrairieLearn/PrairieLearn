import { EncodedData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { HeadContents } from '../../components/HeadContents.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { compiledScriptTag } from '../../lib/assets.js';

import { AccessRulesTable } from './accessRulesTable.js';
import { AssessmentAccessRuleRow } from './instructorAssessmentAccess.types.js';

export function InstructorAssessmentAccess({
  resLocals,
  accessRules,
  origHash,
}: {
  resLocals: Record<string, any>;
  accessRules: AssessmentAccessRuleRow[];
  origHash: string;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })} ${compiledScriptTag('instructorAssessmentAccessClient.ts')}
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
          ${AssessmentSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            assessment: resLocals.assessment,
            courseInstance: resLocals.course_instance,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
          <div class="js-edit-access-rule-modal-container"></div>
          <div class="js-delete-access-rule-modal-container"></div>
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
                      <button class="btn btn-sm btn-light js-enable-edit-button">
                        <i class="fa fa-edit" aria-hidden="true"></i> Edit Access Rules
                      </button>
                      <span class="js-edit-buttons-container" style="display: none">
                        <button class="btn btn-sm btn-light js-save-and-sync-button" type="button">
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
