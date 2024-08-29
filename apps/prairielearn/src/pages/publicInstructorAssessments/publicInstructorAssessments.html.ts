import { z } from 'zod';

import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { compiledScriptTag } from '../../lib/assets.js';
import { AssessmentSchema, AssessmentSetSchema } from '../../lib/db-types.js';
import { HeadContents } from '../../components/HeadContents.html.js';

export const AssessmentStatsRowSchema = AssessmentSchema.extend({
  needs_statistics_update: z.boolean().optional(),
});

export const AssessmentRowSchema = AssessmentStatsRowSchema.merge(
  AssessmentSetSchema.pick({ abbreviation: true, name: true, color: true }),
).extend({
  assessment_group_heading: AssessmentSetSchema.shape.heading,
  label: z.string(),
});
type AssessmentRow = z.infer<typeof AssessmentRowSchema>;

export function InstructorAssessments({
  resLocals,
  rows,
}: {
  resLocals: Record<string, any>;
  rows: AssessmentRow[];
  assessmentIdsNeedingStatsUpdate: string[];
}) {
  const { urlPrefix, course, __csrf_token } = resLocals;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })} ${compiledScriptTag('instructorAssessmentsClient.ts')}
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
                          <a
                            href="${urlPrefix}/public/course_instance/${resLocals.course_instance_id}/instructor/assessment/${row.id}/questions"
                            >${row.title}
                            ${row.group_work
                              ? html` <i class="fas fa-users" aria-hidden="true"></i> `
                              : ''}</a
                          >
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
