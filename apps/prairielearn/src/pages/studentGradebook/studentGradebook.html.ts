import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { Scorebar } from '../../components/Scorebar.html.js';
import {
  AssessmentInstanceSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  AssessmentAccessRuleSchema,
} from '../../lib/db-types.js';

export const StudentGradebookRowSchema = z.object({
  assessment_group_work: AssessmentSchema.shape.group_work,
  title: z.string(),
  assessment_set_heading: AssessmentSetSchema.shape.heading,
  assessment_set_color: AssessmentSetSchema.shape.color,
  label: z.string(),
  assessment_instance_score_perc: AssessmentInstanceSchema.shape.score_perc,
  show_closed_assessment_score: AssessmentAccessRuleSchema.shape.show_closed_assessment_score,
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
        ${HeadContents({ resLocals })}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'gradebook' })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h1>Gradebook</h1>
            </div>

            <table class="table table-sm table-hover" aria-label="Gradebook">
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
                          ? Scorebar(row.assessment_instance_score_perc)
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
