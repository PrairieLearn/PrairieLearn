import { z } from 'zod';

import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { AssessmentSchema, AssessmentSetSchema } from '../../lib/db-types.js';

function CopyCourseInstanceModal({ resLocals }: { resLocals: Record<string, any> }) {
  const { course_instance_copy_targets, course_instance } = resLocals;
  if (course_instance_copy_targets == null) return '';
  return Modal({
    id: 'copyCourseInstanceModal',
    title: 'Copy course instance',
    formAction: course_instance_copy_targets[0]?.copy_url ?? '',
    body:
      course_instance_copy_targets.length === 0
        ? html`
            <p>
              You can't copy this course instance because you don't have editor permissions in any
              courses.
              <a href="/pl/request_course">Request a course</a> if you don't have one already.
              Otherwise, contact the owner of the course you expected to have access to.
            </p>
          `
        : html`
            <p>
              This course instance can be copied to course for which you have editor permissions.
              Select one of your courses to copy this course instance to.
            </p>
            <select class="custom-select" name="to_course_id" required>
              ${course_instance_copy_targets.map(
                // TEST, use course instead of course_instance?
                (course_instance, index) => html`
                  <option
                    value="${course_instance.id}"
                    data-csrf-token="${course_instance.__csrf_token}"
                    data-copy-url="${course_instance.copy_url}"
                    ${index === 0 ? 'selected' : ''}
                  >
                    ${course_instance.short_name}
                  </option>
                `,
              )}
            </select>
          `,
    footer: html`
      <input
        type="hidden"
        name="__csrf_token"
        value="${course_instance_copy_targets[0]?.__csrf_token ?? ''}"
      />
      <input type="hidden" name="course_instance_id" value="${course_instance.id}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      ${course_instance_copy_targets?.length > 0
        ? html`
            <button
              type="submit"
              name="__action"
              value="copy_course_instance"
              class="btn btn-primary"
            >
              Copy course instance
            </button>
          `
        : ''}
    `,
  });
}

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
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })} ${compiledScriptTag('instructorAssessmentsClient.ts')}
      </head>
      <body>
        ${Navbar({ resLocals })}

        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-primary">
              <button
                class="btn btn-light btn-sm ml-auto"
                style="float: right;"
                type="button"
                data-toggle="modal"
                data-target="#copyCourseInstanceModal"
              >
                <i class="fa fa-clone"></i>
                Copy course instance
              </button>
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
                            href="/pl/public/course_instance/${resLocals.course_instance_id}/assessment/${row.id}/questions"
                            class="badge color-${row.color} color-hover"
                          >
                            ${row.label}
                          </a>
                        </td>
                        <td class="align-middle">
                          <a
                            href="/pl/public/course_instance/${resLocals.course_instance_id}/assessment/${row.id}/questions"
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
    ${CopyCourseInstanceModal({ resLocals })}
  `.toString();
}
