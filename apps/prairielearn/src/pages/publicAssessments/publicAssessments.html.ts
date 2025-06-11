import { html } from '@prairielearn/html';

import { AssessmentModuleHeading } from '../../components/AssessmentModuleHeading.html.js';
import { AssessmentSetHeading } from '../../components/AssessmentSetHeading.html.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import type { CourseInstance } from '../../lib/db-types.js';
import { type AssessmentRow } from '../../models/assessment.js';

export function PublicAssessments({
  resLocals,
  rows,
  courseInstance,
}: {
  resLocals: Record<string, any>;
  rows: AssessmentRow[];
  courseInstance: CourseInstance;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Assessments',
    navContext: {
      type: 'public',
      page: 'assessments',
    },
    options: {
      fullWidth: false,
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
                <th style="width: 1%"><span class="visually-hidden">Label</span></th>
                <th><span class="visually-hidden">Title</span></th>
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
                            ${courseInstance.assessments_group_by === 'Set'
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
                        href="/pl/public/course_instance/${courseInstance.id}/assessment/${row.id}/questions"
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
