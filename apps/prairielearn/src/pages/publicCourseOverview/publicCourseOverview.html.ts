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
                    <th id="earliest-access-date">
                      Earliest Access Date
                      <button
                        class="btn btn-xs btn-light"
                        data-toggle="popover"
                        data-container="body"
                        data-placement="bottom"
                        data-html="true"
                        title="Earliest Access Date"
                        data-content="${PopoverStartDate()}"
                        aria-label="Information about Earliest Access Date"
                      >
                        <i class="far fa-question-circle" aria-hidden="true"></i>
                      </button>
                    </th>
                    <th id="latest-access-date">
                      Latest Access Date
                      <button
                        class="btn btn-xs btn-light"
                        data-toggle="popover"
                        data-container="body"
                        data-placement="bottom"
                        data-html="true"
                        title="Latest Access Date"
                        data-content="${PopoverEndDate()}"
                        aria-label="Information about Latest Access Date"
                      >
                        <i class="far fa-question-circle" aria-hidden="true"></i>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  ${courseInstances.map((row) => {
                    return html`
                      <tr>
                        <td class="align-left">
                          <a
                            href="${resLocals.plainUrlPrefix}/course_instance/${row.id}/instructor/instance_admin"
                            >${row.long_name}</a
                          >
                        </td>
                        <td class="align-left">${row.short_name}</td>
                        <td class="align-left">${row.formatted_start_date}</td>
                        <td class="align-left">${row.formatted_end_date}</td>
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
            urlPrefix: resLocals.urlPrefix,
            plainUrlPrefix: resLocals.plainUrlPrefix,
            __csrf_token: resLocals.__csrf_token,
          })}
        </main>
      </body>
    </html>
  `.toString();
}


function PopoverStartDate() {
  return html`
    <p>
      This date is the earliest <code>startDate</code> that appears in any
      <code>accessRule</code> for the course instance. Course instances are listed in order from
      newest to oldest according to this date.
    </p>
    <p>
      It is recommended that you define at least one <code>accessRule</code> that makes the course
      instance accessible to students only during the semester or other time period in which that
      particular course instance is offered. You can do so by editing the
      <code>infoCourseInstance.json</code> file for the course instance. For more information, see
      the
      <a href="https://prairielearn.readthedocs.io/en/latest/accessControl/"
        >documentation on access control</a
      >.
    </p>
  `.toString();
}

function PopoverEndDate() {
  return html`
    <p>
      This date is the latest <code>endDate</code> that appears in any <code>accessRule</code> for
      the course instance. If two course instances have the same "Earliest Access Date," then they
      are listed from newest to oldest according to this "Latest Access Date."
    </p>
    <p>
      It is recommended that you define at least one <code>accessRule</code> that makes the course
      instance accessible to students only during the semester or other time period in which that
      particular course instance is offered. You can do so by editing the
      <code>infoCourseInstance.json</code> file for the course instance. For more information, see
      the
      <a href="https://prairielearn.readthedocs.io/en/latest/accessControl/"
        >documentation on access control</a
      >.
    </p>
  `.toString();
}
