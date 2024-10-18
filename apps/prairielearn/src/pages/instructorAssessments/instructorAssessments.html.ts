import { z } from 'zod';

import { EncodedData } from '@prairielearn/browser-utils';
import { formatInterval } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { IssueBadge } from '../../components/IssueBadge.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { Scorebar } from '../../components/Scorebar.html.js';
import { CourseInstanceSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { SyncProblemButton } from '../../components/SyncProblemButton.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { AssessmentSchema, AssessmentSetSchema } from '../../lib/db-types.js';

import { type StatsUpdateData } from './instructorAssessments.types.js';

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
        ${HeadContents({ resLocals })} ${compiledScriptTag('instructorAssessmentsClient.ts')}
        ${EncodedData<StatsUpdateData>(
          { assessmentIdsNeedingStatsUpdate, urlPrefix },
          'stats-update-data',
        )}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          ${CourseInstanceSyncErrorsAndWarnings({
            authz_data,
            courseInstance: resLocals.course_instance,
            course,
            urlPrefix,
          })}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <h1>Assessments</h1>
              ${authz_data.has_course_permission_edit && !course.example_course
                ? html`
                    <form class="ml-auto" name="add-assessment-form" method="POST">
                      <input type="hidden" name="__csrf_token" value="${__csrf_token}" />
                      <button name="__action" value="add_assessment" class="btn btn-sm btn-light">
                        <i class="fa fa-plus" aria-hidden="true"></i>
                        <span class="d-none d-sm-inline">Add assessment</span>
                      </button>
                    </form>
                  `
                : ''}
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover" aria-label="Assessments">
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
                              <th colspan="7" scope="row">${row.assessment_group_heading}</th>
                            </tr>
                          `
                        : ''}
                      <tr id="row-${row.id}">
                        <td class="align-middle" style="width: 1%">
                          <span class="badge color-${row.color}">${row.label}</span>
                        </td>
                        <td class="align-middle">
                          ${row.sync_errors
                            ? SyncProblemButton({
                                type: 'error',
                                output: row.sync_errors,
                              })
                            : row.sync_warnings
                              ? SyncProblemButton({
                                  type: 'warning',
                                  output: row.sync_warnings,
                                })
                              : ''}
                          <a href="${urlPrefix}/assessment/${row.id}/">
                            ${row.title}
                            ${row.group_work
                              ? html` <i class="fas fa-users" aria-hidden="true"></i> `
                              : ''}
                          </a>
                          ${IssueBadge({ count: row.open_issue_count, urlPrefix })}
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
              Download
              <a href="${urlPrefix}/instance_admin/assessments/file/${csvFilename}">
                ${csvFilename}
              </a>
              (includes more statistics columns than displayed above)
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
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
                ${Scorebar(Math.round(row.score_stat_mean))}
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
