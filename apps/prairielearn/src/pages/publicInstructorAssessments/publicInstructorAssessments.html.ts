import { AnsiUp } from 'ansi_up';
import { z } from 'zod';

import { EncodedData } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { compiledScriptTag } from '../../lib/assets.js';
import { AssessmentSchema, AssessmentSetSchema } from '../../lib/db-types.js';

import { StatsUpdateData } from './publicInstructorAssessments.types.js';

export const AssessmentStatsRowSchema = AssessmentSchema.extend({
  needs_statistics_update: z.boolean().optional(),
});

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
}: {
  resLocals: Record<string, any>;
  rows: AssessmentRow[];
  assessmentIdsNeedingStatsUpdate: string[];
  csvFilename: string;
}) {
  const { urlPrefix, course, __csrf_token } = resLocals;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", resLocals)}
        ${compiledScriptTag('instructorAssessmentsClient.ts')}
        ${EncodedData<StatsUpdateData>(
          { assessmentIdsNeedingStatsUpdate, urlPrefix },
          'stats-update-data',
        )}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", resLocals)}
          <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary">
              <div class="row align-items-center justify-content-between">
                <div class="col-auto">
                  <span class="text-white">Assessments</span>
                </div>
              </div>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover">
                <thead>
                  <tr>
                    <th style="width: 1%"><span class="sr-only">Label</span></th>
                    <th><span class="sr-only">Title</span></th>
                    <th>AID</th>
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
                            href="${urlPrefix}/public/course_instance/${resLocals.course_instance_id}/instructor/assessment/${row.id}/questions"
                            class="badge color-${row.color} color-hover"
                          >
                            ${row.label}
                          </a>
                        </td>
                        <td class="align-middle">
                          <a href="${urlPrefix}/public/course_instance/${resLocals.course_instance_id}/instructor/assessment/${row.id}/questions"
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

                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </main>
      </body>
    </html>
  `.toString();
}
