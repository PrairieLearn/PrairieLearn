import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { Scorebar } from '../../components/Scorebar.html.js';
import {
  AuthzAccessRuleSchema,
  StudentAccessRulesPopover,
} from '../../components/StudentAccessRulesPopover.html.js';
import {
  AssessmentSchema,
  AssessmentSetSchema,
  AssessmentAccessRuleSchema,
  AssessmentInstanceSchema,
} from '../../lib/db-types.js';

export const StudentAssessmentsRowSchema = z.object({
  multiple_instance_header: z.boolean(),
  assessment_number: AssessmentSchema.shape.number,
  title: AssessmentSchema.shape.title,
  group_work: AssessmentSchema.shape.group_work.nullable(),
  assessment_set_name: AssessmentSetSchema.shape.name,
  assessment_set_color: AssessmentSetSchema.shape.color,
  label: z.string(),
  credit_date_string: z.string(),
  active: AssessmentAccessRuleSchema.shape.active,
  access_rules: AuthzAccessRuleSchema.array(),
  show_closed_assessment_score: AssessmentAccessRuleSchema.shape.show_closed_assessment_score,
  assessment_instance_id: AssessmentInstanceSchema.shape.id.nullable(),
  assessment_instance_score_perc: AssessmentInstanceSchema.shape.score_perc.nullable(),
  assessment_instance_open: AssessmentInstanceSchema.shape.open.nullable(),
  link: z.string(),
  start_new_assessment_group: z.boolean(),
  assessment_group_heading: z.string(),
});
type StudentAssessmentsRow = z.infer<typeof StudentAssessmentsRowSchema>;

export function StudentAssessments({
  resLocals,
  rows,
}: {
  resLocals: Record<string, any>;
  rows: StudentAssessmentsRow[];
}) {
  const { urlPrefix, authz_data } = resLocals;
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
      </head>
      <body>
        ${Navbar({ resLocals, navPage: 'assessments' })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h1>Assessments</h1>
            </div>

            <table class="table table-sm table-hover" aria-label="Assessments">
              <thead>
                <tr>
                  <th style="width: 1%"><span class="sr-only">Label</span></th>
                  <th><span class="sr-only">Title</span></th>
                  <th class="text-center">Available credit</th>
                  <th class="text-center">Score</th>
                </tr>
              </thead>
              <tbody>
                ${rows.map(
                  (row) => html`
                    ${row.start_new_assessment_group
                      ? html`
                          <tr>
                            <th colspan="4" scope="row" data-testid="assessment-group-heading">
                              ${row.assessment_group_heading}
                            </th>
                          </tr>
                        `
                      : ''}
                    <tr>
                      <td class="align-middle" style="width: 1%">
                        <span
                          class="badge color-${row.assessment_set_color}"
                          data-testid="assessment-set-badge"
                        >
                          ${row.label}
                        </span>
                      </td>
                      <td class="align-middle">
                        ${row.multiple_instance_header ||
                        (!row.active && row.assessment_instance_id == null)
                          ? row.title
                          : html`
                              <a href="${urlPrefix}${row.link}">
                                ${row.title}
                                ${row.group_work
                                  ? html`<i class="fas fa-users" aria-hidden="true"></i>`
                                  : ''}
                              </a>
                            `}
                      </td>
                      <td class="text-center align-middle">
                        ${row.assessment_instance_open !== false
                          ? row.credit_date_string
                          : 'Assessment closed.'}
                        ${StudentAccessRulesPopover({
                          accessRules: row.access_rules,
                        })}
                      </td>
                      <td class="text-center align-middle">
                        ${row.multiple_instance_header
                          ? NewInstanceButton({ urlPrefix, row })
                          : AssessmentScore(row)}
                      </td>
                    </tr>
                  `,
                )}
              </tbody>
            </table>
          </div>
          ${authz_data.mode === 'Exam'
            ? html`
                <p>
                  Don't see your exam? Exams for this course are only made available to students
                  with checked-in exam reservations. See a proctor for assistance.
                </p>
              `
            : ''}
        </main>
      </body>
    </html>
  `.toString();
}

function AssessmentScore(row: StudentAssessmentsRow) {
  if (row.assessment_instance_id == null) return 'Not started';
  if (!row.show_closed_assessment_score) return 'Score not shown';
  return Scorebar(row.assessment_instance_score_perc, { classes: 'mx-auto' });
}

function NewInstanceButton({ urlPrefix, row }: { urlPrefix: string; row: StudentAssessmentsRow }) {
  if (row.active) {
    return html`<a href="${urlPrefix}${row.link}" class="btn btn-primary btn-sm">New instance</a>`;
  } else {
    return html`<button type="button" disabled class="btn btn-primary btn-sm">
      New instance
    </button>`;
  }
}
