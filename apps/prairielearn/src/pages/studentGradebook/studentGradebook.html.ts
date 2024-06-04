import { z } from 'zod';

import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import {
  AssessmentInstanceSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  AssessmentAccessRulesSchema,
} from '../../lib/db-types.js';

export const StudentGradebookRowSchema = z.object({
  assessment_id: AssessmentSchema.shape.id,
  assessment_number: AssessmentSchema.shape.number,
  assessment_order_by: AssessmentSchema.shape.order_by,
  assessment_group_work: AssessmentSchema.shape.group_work,
  title: z.string(),
  assessment_set_id: AssessmentSetSchema.shape.id,
  assessment_set_abbreviation: AssessmentSetSchema.shape.abbreviation,
  assessment_set_name: AssessmentSetSchema.shape.name,
  assessment_set_heading: AssessmentSetSchema.shape.heading,
  assessment_set_color: AssessmentSetSchema.shape.color,
  assessment_set_number: AssessmentSetSchema.shape.number,
  label: z.string(),
  assessment_instance_id: AssessmentInstanceSchema.shape.id,
  assessment_instance_number: AssessmentInstanceSchema.shape.number,
  assessment_instance_score_perc: AssessmentInstanceSchema.shape.score_perc,
  assessment_instance_open: AssessmentInstanceSchema.shape.open,
  show_closed_assessment_score: AssessmentAccessRulesSchema.shape.show_closed_assessment_score,
  start_new_set: z.boolean(),
});
type StudentGradebookRow = z.infer<typeof StudentGradebookRowSchema>;

export function StudentGradebook({
  resLocals,
  rows,
}: {
  resLocals: Record<string, any>;
  rows: StudentGradebookRow[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head') %>", resLocals)}
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", {
          ...resLocals,
          navPage: 'gradebook',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">Gradebook</div>

            <table class="table table-sm table-hover">
              <thead>
                <tr>
                  <th style="width: 1%"><span class="sr-only">Label</span></th>
                  <th><span class="sr-only">Title</span></th>
                  <th class="text-center">Score</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(
                  (row) => html`
                    ${row.start_new_set
                      ? html`
                          <tr>
                            <th colspan="3">${row.assessment_set_heading}</th>
                          </tr>
                        `
                      : ''}
                    <tr>
                      <td class="align-middle" style="width: 1%">
                        <span class="badge color-${row.assessment_set_color} color-hover">
                          ${row.label}
                        </span>
                      </td>
                      <td class="align-middle">
                        ${row.title}
                        ${row.assessment_group_work
                          ? html`<i class="fas fa-users" aria-hidden="true"></i>`
                          : ''}
                      </td>
                      <td class="text-center align-middle">
                        ${row.show_closed_assessment_score
                          ? renderEjs(import.meta.url, "<%- include('../partials/scorebar'); %>", {
                              score: row.assessment_instance_score_perc,
                            })
                          : 'Score not shown'}
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
