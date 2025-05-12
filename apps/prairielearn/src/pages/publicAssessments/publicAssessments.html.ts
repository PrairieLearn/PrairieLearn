import { z } from 'zod';

import { html } from '@prairielearn/html';

import { AssessmentModuleHeading } from '../../components/AssessmentModuleHeading.html.js';
import { AssessmentSetHeading } from '../../components/AssessmentSetHeading.html.js';
import { Modal } from '../../components/Modal.html.js';
import { PageLayout } from '../../components/PageLayout.html.js';
import {
  AssessmentModuleSchema,
  AssessmentSchema,
  AssessmentSetSchema,
} from '../../lib/db-types.js';

export const AssessmentRowSchema = AssessmentSchema.extend({
  start_new_assessment_group: z.boolean(),
  assessment_set: AssessmentSetSchema,
  assessment_module: AssessmentModuleSchema,
  label: z.string(),
});
type AssessmentRow = z.infer<typeof AssessmentRowSchema>;

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

export function PublicAssessments({
  resLocals,
  rows,
  assessmentsGroupBy,
}: {
  resLocals: Record<string, any>;
  rows: AssessmentRow[];
  assessmentsGroupBy: 'Set' | 'Module';
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
      ${CopyCourseInstanceModal({ resLocals })}
    `,
  });
}
