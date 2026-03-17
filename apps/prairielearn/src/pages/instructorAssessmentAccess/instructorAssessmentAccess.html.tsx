import { z } from 'zod';

import { html } from '@prairielearn/html';
import { hydrateHtml } from '@prairielearn/react/server';

import { CommentPopoverHtml } from '../../components/CommentPopover.js';
import { PageLayout } from '../../components/PageLayout.js';
import type { AssessmentMigrationAnalysis } from '../../lib/access-control-migration.js';
import { compiledStylesheetTag } from '../../lib/assets.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { isRenderableComment } from '../../lib/comments.js';
import { config } from '../../lib/config.js';
import { JsonCommentSchema } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

import { AccessControl } from './components/AccessControl.js';
import type { AccessControlJsonWithId } from './components/types.js';

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

export function InstructorAssessmentAccess({
  resLocals,
  accessRules,
  migrationAnalysis,
  origHash,
  canEdit,
}: {
  resLocals: ResLocalsForPage<'assessment'>;
  accessRules: AssessmentAccessRules[];
  migrationAnalysis: AssessmentMigrationAnalysis | null;
  origHash: string;
  canEdit: boolean;
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
        </div>

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

      ${migrationAnalysis && canEdit
        ? MigrationCard({ migrationAnalysis, origHash, csrfToken: resLocals.__csrf_token })
        : ''}
    `,
  });
}

function MigrationCard({
  migrationAnalysis,
  origHash,
  csrfToken,
}: {
  migrationAnalysis: AssessmentMigrationAnalysis;
  origHash: string;
  csrfToken: string;
}) {
  return html`
    <div class="card mb-4">
      <div class="card-header bg-secondary text-white">
        <h2 class="h6 mb-0">Migrate to modern access control</h2>
      </div>
      <div class="card-body">
        <p>
          Classification: <code>${migrationAnalysis.archetype}</code>
          (${migrationAnalysis.ruleCount} legacy
          rule${migrationAnalysis.ruleCount === 1 ? '' : 's'})
        </p>
        ${migrationAnalysis.hasUidRules
          ? html`
              <div class="alert alert-warning">
                This assessment has UID-based access rules that will be removed during migration.
                UID-based rules have no equivalent in the modern access control format.
              </div>
            `
          : ''}
        ${migrationAnalysis.canMigrate
          ? html`
              <form method="POST">
                <input type="hidden" name="__csrf_token" value="${csrfToken}" />
                <input type="hidden" name="__action" value="migrate_access_control" />
                <input type="hidden" name="orig_hash" value="${origHash}" />
                <button type="submit" class="btn btn-primary">Migrate to modern format</button>
              </form>
            `
          : html`
              <p class="text-muted mb-0">
                This assessment's access rules cannot be automatically migrated. Manual conversion
                is required.
              </p>
            `}
      </div>
    </div>
  `;
}

export function InstructorAssessmentAccessNew({
  resLocals,
  origHash,
  trpcCsrfToken,
  initialData,
}: {
  resLocals: ResLocalsForPage<'assessment'>;
  origHash: string;
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
    headContent: [compiledStylesheetTag('splitPane.css')],
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'access',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      ${hydrateHtml(
        <AccessControl
          courseInstance={pageContext.course_instance}
          csrfToken={trpcCsrfToken}
          origHash={origHash}
          assessmentId={resLocals.assessment.id}
          initialData={initialData}
        />,
      )}
    `,
  });
}
