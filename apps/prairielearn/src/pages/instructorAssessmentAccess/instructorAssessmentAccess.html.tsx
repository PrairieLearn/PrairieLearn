import { z } from 'zod';

import { html } from '@prairielearn/html';
import { Hydrate } from '@prairielearn/react/server';

import { CommentPopoverHtml } from '../../components/CommentPopover.js';
import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import type { AssessmentMigrationAnalysis } from '../../lib/assessment-access-control/migration.js';
import { compiledStylesheetTag } from '../../lib/assets.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { isRenderableComment } from '../../lib/comments.js';
import { config } from '../../lib/config.js';
import { JsonCommentSchema } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import type { AccessControlJsonWithId } from '../../models/assessment-access-control-rules.js';

import { AssessmentAccessControl } from './components/AssessmentAccessControl.js';

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
  comment: JsonCommentSchema.nullable(),
});
type AssessmentAccessRules = z.infer<typeof AssessmentAccessRulesSchema>;

interface MigrationPreview {
  beforeJson: string;
  afterJson: string;
  warnings: string[];
  hasUidRules: boolean;
}

export function InstructorAssessmentAccess({
  resLocals,
  accessRules,
  migrationAnalysis,
  migrationPreview,
  origHash,
  canEdit,
  enhancedAccessControlEnabled,
}: {
  resLocals: ResLocalsForPage<'assessment'>;
  accessRules: AssessmentAccessRules[];
  migrationAnalysis: AssessmentMigrationAnalysis | null;
  migrationPreview: MigrationPreview | null;
  origHash: string;
  canEdit: boolean;
  enhancedAccessControlEnabled: boolean;
}) {
  const showComments = accessRules.some((access_rule) => isRenderableComment(access_rule.comment));
  return PageLayout({
    resLocals,
    pageTitle: 'Access',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'access',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>${resLocals.assessment_set.name} ${resLocals.assessment.number}: Access</h1>
          ${migrationPreview && canEdit
            ? html`
                <button
                  type="button"
                  class="btn btn-light btn-sm ms-auto"
                  data-bs-toggle="modal"
                  data-bs-target="#migrationConfirmModal"
                >
                  Migrate to modern format
                </button>
              `
            : ''}
        </div>

        ${enhancedAccessControlEnabled
          ? html`
              <div
                class="alert alert-warning mb-0 rounded-0 border-start-0 border-end-0 border-top-0"
              >
                ${migrationAnalysis && !migrationAnalysis.canMigrate
                  ? html`This assessment uses the legacy access control system. Automatic migration
                    is not available for this assessment's access rules.`
                  : html`This assessment uses the legacy access control system. Consider migrating
                    to the modern format for a better editing experience.`}
              </div>
            `
          : ''}

        <div class="table-responsive">
          <table class="table table-sm table-hover" aria-label="Access rules">
            <thead>
              <tr>
                ${showComments
                  ? html`<th style="width: 1%"><span class="visually-hidden">Comments</span></th>`
                  : ''}
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
              ${accessRules.map((access_rule) => {
                // Only users with permission to view student data are allowed
                // to see the list of uids associated with an access rule. Note,
                // however, that any user with permission to view course code
                // (or with access to the course git repository) will be able to
                // see the list of uids, because these access rules are defined
                // in course code. This should be changed in future, to protect
                // student data. See https://github.com/PrairieLearn/PrairieLearn/issues/3342
                return html`
                  <tr>
                    ${showComments ? html`<td>${CommentPopoverHtml(access_rule.comment)}</td>` : ''}
                    <td>${access_rule.mode}</td>
                    <td>
                      ${access_rule.uids === '—' ||
                      resLocals.authz_data.has_course_instance_permission_view
                        ? access_rule.uids
                        : html`
                            <button
                              type="button"
                              class="btn btn-xs btn-warning"
                              data-bs-toggle="popover"
                              data-bs-container="body"
                              data-bs-placement="auto"
                              data-bs-title="Hidden UIDs"
                              data-bs-content="This access rule is specific to individual students. You need permission to view student data in order to see which ones."
                            >
                              Hidden
                            </button>
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
                              href="${config.ptHost}/pt/course/${access_rule.pt_course_id}/staff/exam/${access_rule.pt_exam_id}"
                            >
                              ${access_rule.pt_course_name}: ${access_rule.pt_exam_name}
                            </a>
                          `
                        : access_rule.exam_uuid
                          ? config.devMode
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
              href="https://docs.prairielearn.com/assessment/accessControl/"
              target="_blank"
              rel="noreferrer"
              >PrairieLearn documentation</a
            >. Note that changing time limit rules does not affect assessments in progress; to
            change the time limit for these exams please visit the
            <a href="${resLocals.urlPrefix}/assessment/${resLocals.assessment.id}/instances"
              >Students tab</a
            >.</small
          >
        </div>
      </div>

      ${migrationPreview && canEdit
        ? MigrationConfirmModal({ migrationPreview, resLocals, origHash })
        : ''}
    `,
  });
}

function MigrationConfirmModal({
  migrationPreview,
  resLocals,
  origHash,
}: {
  migrationPreview: MigrationPreview;
  resLocals: ResLocalsForPage<'assessment'>;
  origHash: string;
}) {
  return Modal({
    id: 'migrationConfirmModal',
    title: 'Migrate to modern format',
    size: 'modal-xl',
    content: html`
      <div class="modal-body">
        ${migrationPreview.hasUidRules
          ? html`
              <div class="alert alert-warning">
                <i class="bi bi-exclamation-triangle-fill"></i>
                This assessment has UID-based access rules that will be dropped during migration.
                UID-based rules are not supported in the modern format.
              </div>
            `
          : ''}
        ${migrationPreview.warnings.length > 0
          ? html`
              <div class="alert alert-info">
                <i class="bi bi-info-circle-fill"></i>
                <strong>Migration notes:</strong>
                <ul class="mb-0 mt-1">
                  ${migrationPreview.warnings.map((w) => html`<li>${w}</li>`)}
                </ul>
              </div>
            `
          : ''}
        <ul class="nav nav-tabs" role="tablist">
          <li class="nav-item" role="presentation">
            <button
              class="nav-link active"
              data-bs-toggle="tab"
              data-bs-target="#migration-before"
              type="button"
              role="tab"
              aria-controls="migration-before"
              aria-selected="true"
            >
              Previous state
            </button>
          </li>
          <li class="nav-item" role="presentation">
            <button
              class="nav-link"
              data-bs-toggle="tab"
              data-bs-target="#migration-after"
              type="button"
              role="tab"
              aria-controls="migration-after"
              aria-selected="false"
            >
              New state
            </button>
          </li>
        </ul>
        <div class="tab-content border border-top-0 rounded-bottom">
          <div class="tab-pane fade show active p-3" id="migration-before" role="tabpanel">
            <pre
              style="max-height: 400px; overflow-y: auto;"
              class="mb-0"
            ><code>${migrationPreview.beforeJson}</code></pre>
          </div>
          <div class="tab-pane fade p-3" id="migration-after" role="tabpanel">
            <pre
              style="max-height: 400px; overflow-y: auto;"
              class="mb-0"
            ><code>${migrationPreview.afterJson}</code></pre>
          </div>
        </div>
      </div>
    `,
    footer: html`
      <input type="hidden" name="__action" value="migrate_access_control" />
      <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
      <input type="hidden" name="orig_hash" value="${origHash}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Confirm migration</button>
    `,
  });
}

export function InstructorAssessmentAccessNew({
  resLocals,
  origHash,
  trpcCsrfToken,
  initialData,
}: {
  resLocals: ResLocalsForPage<'assessment'>;
  origHash: string | null;
  trpcCsrfToken: string;
  initialData: AccessControlJsonWithId[];
}) {
  const pageContext = extractPageContext(resLocals, {
    pageType: 'courseInstance',
    accessType: 'instructor',
  });

  return PageLayout({
    resLocals,
    pageTitle: 'Access',
    headContent: [
      compiledStylesheetTag('splitPane.css'),
      compiledStylesheetTag('instructorAssessmentAccess.css'),
    ],
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'access',
    },
    options: {
      fullWidth: true,
      contentPadding: false,
    },
    content: (
      <Hydrate>
        <AssessmentAccessControl
          courseInstance={pageContext.course_instance}
          csrfToken={trpcCsrfToken}
          origHash={origHash}
          assessmentId={resLocals.assessment.id}
          initialData={initialData}
        />
      </Hydrate>
    ),
  });
}
