import { z } from 'zod';

import { html } from '@prairielearn/html';

import { compiledScriptTag } from '../../lib/assets.js';
import { AssessmentSchema, AssessmentSetSchema } from '../../lib/db-types.js';
import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { CourseInstanceAuthz } from '../../models/course-instances.js';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.html.js';
import { QuestionsPageData } from '../../models/questions.js';

export type CourseInstanceAuthzRow = CourseInstanceAuthz & { enrollment_count?: number };

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

export function PublicCourseOverview({ 
  assessmentsData, 
  questions, 
  resLocals 
}) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Course Overview</title>
      ${HeadContents({ resLocals, pageTitle: 'Course Overview' })}
    </head>
    <body>
      <main>
        <div>
          ${assessmentsData}
        </div>
        <div>
          ${questions}
        </div>
      </main>
    </body>
    </html>
  `;
}


// Assessments above Questions
export function publicCourseOverviewPage ({
  resLocals,
  assessmentRows,
  questions,
  courseInstances,
}: {
  resLocals: Record<string, any>;
  assessmentRows: AssessmentRow[];
  questions: QuestionsPageData[];
  courseInstances: CourseInstanceAuthzRow[];
}) {
  const { urlPrefix, course, __csrf_token } = resLocals;
  const qidPrefix = course.example_course ? '' : `@${course.sharing_name}/`;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Course Overview' })}
        ${compiledScriptTag('instructorAssessmentsClient.ts')}
        ${QuestionsTableHead()}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <h1>Course instances</h1>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped" aria-label="Course instances">
                <thead>
                  <tr>
                    <th>Long Name</th>
                    <th>CIID</th>
                  </tr>
                </thead>
                <tbody>
                  ${courseInstances.map((row) => {
                    return html`
                      <tr>
                        <td class="align-left">
                          <a
                            href="${resLocals.plainUrlPrefix}/public/course_instance/${row.id}/instructor/instance_admin/assessments"
                            >${row.long_name}</a
                          >
                        </td>
                        <td class="align-left">${row.short_name}</td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
          </div>

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
                  ${assessmentRows.map(
                    (row) => html`
                      <tr id="row-${row.id}">
                        <td class="align-middle" style="width: 1%">
                          <a
                            href="/pl/public/course_instance/${row.course_instance_id}/instructor/assessment/${row.id}/questions"
                            class="badge color-${row.color} color-hover"
                          >
                            ${row.label}
                          </a>
                        </td>
                        <td class="align-middle">
                          <a
                            href="/pl/public/course_instance/${row.course_instance_id}/instructor/assessment/${row.id}/questions"
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

          ${QuestionsTable({
            questions,
            showAddQuestionButton: false,
            qidPrefix,
            urlPrefix: resLocals.urlPrefix + `/public/course/${course.id}`,
            plainUrlPrefix: resLocals.plainUrlPrefix,
            __csrf_token: resLocals.__csrf_token,
          })}
        </main>
      </body>
    </html>
  `.toString();
}
