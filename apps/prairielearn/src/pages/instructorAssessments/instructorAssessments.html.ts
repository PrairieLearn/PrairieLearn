import { AnsiUp } from 'ansi_up';
import { z } from 'zod';

import { EncodedData } from '@prairielearn/browser-utils';
import { formatInterval } from '@prairielearn/formatter';
import { escapeHtml, html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { compiledScriptTag } from '../../lib/assets.js';
import { AssessmentSchema, AssessmentSetSchema } from '../../lib/db-types.js';

import { StatsUpdateData } from './instructorAssessments.types.js';

export const AssessmentStatsRowSchema = AssessmentSchema.extend({
  needs_statistics_update: z.boolean().optional(),
});
type AssessmentStatsRow = z.infer<typeof AssessmentStatsRowSchema>;

export const AssessmentRowSchema = AssessmentStatsRowSchema.merge(
  AssessmentSetSchema.pick({ abbreviation: true, name: true, color: true }),
).extend({
  start_new_assessment_group: z.boolean(),
  assessment_group_heading: AssessmentSetSchema.shape.heading,
  label: z.string(),
  open_issue_count: z.coerce.number(),
});
type AssessmentRow = z.infer<typeof AssessmentRowSchema>;

const ansiUp = new AnsiUp();

export function InstructorAssessments({
  resLocals,
  rows,
  assessmentIdsNeedingStatsUpdate,
  csvFilename,
}: {
  resLocals: Record<string, any>;
  rows: AssessmentRow[];
  assessmentIdsNeedingStatsUpdate: string[];
  csvFilename: string;
}) {
  const { urlPrefix, authz_data, course, __csrf_token } = resLocals;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", resLocals)}
        ${compiledScriptTag('instructorAssessmentsClient.ts')}
        ${EncodedData(
          { assessmentIdsNeedingStatsUpdate, urlPrefix } as StatsUpdateData,
          'stats-update-data',
        )}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            import.meta.url,
            "<%- include('../partials/courseInstanceSyncErrorsAndWarnings'); %>",
            resLocals,
          )}
          <div class="card mb-4">
            <div class="card-header bg-primary">
              <div class="row align-items-center justify-content-between">
                <div class="col-auto">
                  <span class="text-white">Assessments</span>
                </div>
                ${authz_data.has_course_permission_edit && !course.example_course
                  ? html`
                      <div class="col-auto">
                        <form name="add-assessment-form" method="POST">
                          <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                          <button
                            name="__action"
                            value="add_assessment"
                            class="btn btn-sm btn-light"
                          >
                            <i class="fa fa-plus" aria-hidden="true"></i>
                            <span class="d-none d-sm-inline">Add assessment</span>
                          </button>
                        </form>
                      </div>
                    `
                  : ''}
              </div>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover">
                <thead>
                  <tr>
                    <th style="width: 1%"><span class="sr-only">Label</span></th>
                    <th><span class="sr-only">Title</span></th>
                    <th>AID</th>
                    <th class="text-center">Students</th>
                    <th class="text-center">Scores</th>
                    <th class="text-center">Mean Score</th>
                    <th class="text-center">Mean Duration</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map(
                    (row) => html`
                      ${row.start_new_assessment_group
                        ? html`
                            <tr>
                              <th colspan="7">${row.assessment_group_heading}</th>
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
                          ${row.sync_errors
                            ? SyncProblemButton({
                                output: row.sync_errors,
                                title: 'Sync Errors',
                                classes: 'fa-times text-danger',
                              })
                            : row.sync_warnings
                              ? SyncProblemButton({
                                  output: row.sync_warnings,
                                  title: 'Sync Warnings',
                                  classes: 'fa-exclamation-triangle text-warning',
                                })
                              : ''}
                          <a href="${urlPrefix}/assessment/${row.id}/"
                            >${row.title}
                            ${row.group_work
                              ? html` <i class="fas fa-users" aria-hidden="true"></i> `
                              : ''}</a
                          >
                          ${renderEjs(
                            import.meta.url,
                            "<%- include('../partials/issueBadge'); %>",
                            { ...resLocals, count: row.open_issue_count },
                          )}
                        </td>

                        <td class="align-middle">${row.tid}</td>

                        ${AssessmentStats({ row })}
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>

            <div class="card-footer">
              <p>
                Download
                <a href="${urlPrefix}/instance_admin/assessments/file/${csvFilename}"
                  >${csvFilename}</a
                >
                (includes more statistics columns than displayed above)
              </p>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function SyncProblemButton({
  output,
  title,
  classes,
}: {
  output: string;
  title: string;
  classes: string;
}) {
  const popoverContent = html`<pre
    style="background-color: black"
    class="text-white rounded p-3 mb-0"
  >
${unsafeHtml(ansiUp.ansi_to_html(output))}</pre
  >`;

  return html`
    <button
      class="btn btn-xs mr-1 js-sync-popover"
      data-toggle="popover"
      data-trigger="hover"
      data-container="body"
      data-html="true"
      data-title="${title}"
      data-content="${escapeHtml(popoverContent)}"
    >
      <i class="fa ${classes}" aria-hidden="true"></i>
    </button>
  `;
}

export function AssessmentStats({ row }: { row: AssessmentStatsRow }) {
  const spinner = html`
    <div class="spinner-border spinner-border-sm" role="status">
      <span class="sr-only">Loading...</span>
    </div>
  `;
  return html`
    <td class="text-center align-middle score-stat-number" style="white-space: nowrap;">
      ${row.needs_statistics_update ? spinner : row.score_stat_number}
    </td>

    <td class="text-center align-middle score-stat-score-hist" style="white-space: nowrap;">
      ${row.needs_statistics_update
        ? spinner
        : row.score_stat_number > 0
          ? html`
              <div
                class="js-histmini d-inline-block"
                data-data="${JSON.stringify(row.score_stat_hist)}"
                data-options="${JSON.stringify({ width: 60, height: 20 })}"
              ></div>
            `
          : html`&mdash;`}
    </td>

    <td class="text-center align-middle score-stat-mean" style="white-space: nowrap;">
      ${row.needs_statistics_update
        ? spinner
        : row.score_stat_number > 0
          ? html`
              <div class="d-inline-block align-middle" style="min-width: 8em; max-width: 20em;">
                ${renderEjs(import.meta.url, "<%- include('../partials/scorebar'); %>", {
                  score: Math.round(row.score_stat_mean),
                })}
              </div>
            `
          : html`&mdash;`}
    </td>

    <td class="text-center align-middle duration-stat-mean" style="white-space: nowrap;">
      ${row.needs_statistics_update
        ? spinner
        : row.score_stat_number > 0
          ? formatInterval(row.duration_stat_mean)
          : html`&mdash;`}
    </td>
  `;
}
