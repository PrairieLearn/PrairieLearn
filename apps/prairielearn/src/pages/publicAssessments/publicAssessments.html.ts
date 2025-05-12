import { z } from 'zod';

import { html } from '@prairielearn/html';

import { AssessmentModuleHeading } from '../../components/AssessmentModuleHeading.html.js';
import { AssessmentSetHeading } from '../../components/AssessmentSetHeading.html.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import { AssessmentSchema, AssessmentSetSchema } from '../../lib/db-types.js';

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
  return PageLayout({
    resLocals,
    pageTitle: 'Assessments',
    navContext: {
      type: 'public',
      page: 'assessments',
    },
    options: {
      fullWidth: true,
    },
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Assessments</h1>
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
                          <th colspan="3" scope="row">
                            ${assessmentsGroupBy === 'Set'
                              ? AssessmentSetHeading({ assessment_set: row.assessment_set })
                              : AssessmentModuleHeading({
                                  assessment_module: row.assessment_module,
                                })}
                          </th>
                        </tr>
                      `
                    : ''}
                  <tr id="row-${row.id}">
                    <td class="align-middle" style="width: 1%">
                      <span class="badge color-${row.assessment_set.color}"> ${row.label} </span>
                    </td>
                    <td class="align-middle">
                      <a
                        href="/pl/public/course_instance/${resLocals.course_instance_id}/assessment/${row.id}/questions"
                        >${row.title}
                      </a>
                    </td>

                    <td class="align-middle">${row.tid}</td>
                  </tr>
                `,
              )}
            </tbody>
          </table>
        </div>
      </div>
    `,
  });
}

// <tr id="row-${row.id}">
//                     <td class="align-middle" style="width: 1%">
//                       <a
//                         href="/pl/public/course_instance/${resLocals.course_instance_id}/assessment/${row.id}/questions"
//                         class="badge color-${row.color} color-hover"
//                       >
//                         ${row.label}
//                       </a>
//                     </td>
//                     <td class="align-middle">
//                       <a
//                         href="/pl/public/course_instance/${resLocals.course_instance_id}/assessment/${row.id}/questions"
//                         >${row.title}
//                         ${row.group_work
//                           ? html` <i class="fas fa-users" aria-hidden="true"></i> `
//                           : ''}</a
//                       >
//                     </td>

//                     <td class="align-middle">${row.tid}</td>
//                   </tr>
