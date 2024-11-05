import { z } from 'zod';

import { type HtmlValue, html, joinHtml } from '@prairielearn/html';

import { AssessmentOpenInstancesAlert } from '../../../components/AssessmentOpenInstancesAlert.html.js';
import { HeadContents } from '../../../components/HeadContents.html.js';
import { Modal } from '../../../components/Modal.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../../components/SyncErrorsAndWarnings.html.js';
import { compiledScriptTag } from '../../../lib/assets.js';
import { AssessmentQuestionSchema, type User } from '../../../lib/db-types.js';
import { idsEqual } from '../../../lib/id.js';

export const ManualGradingQuestionSchema = AssessmentQuestionSchema.extend({
  qid: z.string(),
  title: z.string(),
  number: z.string().nullable(),
  alternative_group_number: z.number(),
  alternative_group_size: z.coerce.number(),
  num_instance_questions: z.coerce.number(),
  num_instance_questions_to_grade: z.coerce.number(),
  num_instance_questions_assigned: z.coerce.number(),
  num_instance_questions_unassigned: z.coerce.number(),
  assigned_graders: z
    .array(z.object({ user_id: z.number(), name: z.string().nullable(), uid: z.string() }))
    .nullable(),
  actual_graders: z
    .array(z.object({ user_id: z.number(), name: z.string().nullable(), uid: z.string() }))
    .nullable(),
  num_open_instances: z.coerce.number(),
});
export type ManualGradingQuestion = z.infer<typeof ManualGradingQuestionSchema>;

export function ManualGradingAssessment({
  resLocals,
  questions,
  courseStaff,
  num_open_instances,
}: {
  resLocals: Record<string, any>;
  questions: ManualGradingQuestion[];
  courseStaff: User[];
  num_open_instances: number;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
        ${compiledScriptTag('instructorAssessmentManualGradingAssessmentClient.ts')}
      </head>
      <body>
        ${Navbar({ resLocals })}
        ${resLocals.authz_data.has_course_instance_permission_edit
          ? GraderAssignmentModal({ courseStaff, csrfToken: resLocals.__csrf_token })
          : ''}
        <main id="content" class="container-fluid">
          ${AssessmentSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            assessment: resLocals.assessment,
            courseInstance: resLocals.course_instance,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
          ${AssessmentOpenInstancesAlert({
            numOpenInstances: num_open_instances,
            assessmentId: resLocals.assessment.id,
            urlPrefix: resLocals.urlPrefix,
          })}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              <h1>
                ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Manual Grading
                Queue
              </h1>
            </div>

            <div class="table-responsive">
              <table
                id="instanceQuestionGradingTable"
                class="table table-sm table-hover"
                aria-label="Questions for manual grading"
              >
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>QID</th>
                    <th>Auto Points</th>
                    <th>Manual Points</th>
                    <th colspan="2">Submissions to grade</th>
                    <th>Grading assigned to</th>
                    <th>Graded by</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${questions.map((question) => AssessmentQuestionRow({ resLocals, question }))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function AssessmentQuestionRow({
  resLocals,
  question,
}: {
  resLocals: Record<string, any>;
  question: ManualGradingQuestion;
}) {
  const showGradingButton =
    resLocals.authz_data.has_course_instance_permission_edit &&
    question.num_instance_questions_assigned + question.num_instance_questions_unassigned > 0;
  const currentUserName = resLocals.authz_data.user.name ?? resLocals.authz_data.user.uid;
  const assignedGraders: HtmlValue[] = (question.assigned_graders || [])
    .filter((u) => !idsEqual(u.user_id, resLocals.authz_data.user.user_id))
    .map((u) => u.name ?? u.uid);
  if (question.num_instance_questions_assigned > 0) {
    assignedGraders.unshift(
      html`<strong class="bg-warning rounded px-1">${currentUserName}</strong>`,
    );
  }
  const gradingUrl = `${resLocals.urlPrefix}/assessment/${resLocals.assessment.id}/manual_grading/assessment_question/${question.id}`;

  return html`
    <tr>
      <td class="align-middle">
        <a href="${gradingUrl}">
          ${question.alternative_group_number}.${question.alternative_group_size === 1
            ? ''
            : `${question.number_in_alternative_group}.`}
          ${question.title}
        </a>
        ${question.manual_rubric_id == null
          ? ''
          : html`
              <a
                href="#"
                class="ml-2 text-info"
                data-toggle="tooltip"
                data-boundary="window"
                title="This question uses a rubric"
              >
                <i class="fas fa-list-check"></i><span class="sr-only">(uses rubric)</span>
              </a>
            `}
      </td>
      <td class="align-middle">${question.qid}</td>
      <td class="text-center align-middle">
        ${question.max_auto_points
          ? resLocals.assessment.type === 'Exam'
            ? (question.points_list || [question.max_manual_points ?? 0])
                .map((p) => p - (question.max_manual_points ?? 0))
                .join(',')
            : (question.init_points ?? 0) - (question.max_manual_points ?? 0)
          : '—'}
      </td>
      <td class="text-center align-middle">${question.max_manual_points || '—'}</td>
      <td class="text-center align-middle" data-testid="iq-to-grade-count">
        ${question.num_instance_questions_to_grade} / ${question.num_instance_questions}
      </td>
      <td class="align-middle">
        ${ProgressBar(question.num_instance_questions_to_grade, question.num_instance_questions)}
      </td>
      <td class="align-middle">
        ${joinHtml(assignedGraders, ', ')}
        ${question.num_instance_questions_unassigned > 0
          ? html`
              <small class="text-muted">
                (${question.num_instance_questions_unassigned} unassigned)
              </small>
              ${resLocals.authz_data.has_course_instance_permission_edit
                ? html`
                    <button
                      type="button"
                      class="btn btn-sm btn-ghost"
                      data-toggle="modal"
                      data-target="#grader-assignment-modal"
                      data-assessment-question-id="${question.id}"
                    >
                      <i class="fas fa-pencil"></i><span class="sr-only">Assign to&hellip;</span>
                    </button>
                  `
                : ''}
            `
          : ''}
      </td>
      <td class="align-middle">
        ${(question.actual_graders || []).map((u) => u.name ?? u.uid).join(', ')}
      </td>
      <td class="align-middle">
        ${showGradingButton
          ? html`
              <a class="btn btn-xs btn-primary" href="${gradingUrl}/next_ungraded">
                Grade next submission
              </a>
            `
          : ''}
      </td>
    </tr>
  `;
}

function ProgressBar(partial: number | null, total: number | null) {
  if (total == null || total <= 0) return '';
  const progress = Math.floor(100 * (1 - (partial ?? 0) / total));
  return html`
    <div class="progress border" style="min-width: 4em; max-width: 10em;">
      <div class="progress-bar bg-light" style="width: ${progress}%"></div>
      <div class="progress-bar bg-danger" style="width: ${100 - progress}%"></div>
    </div>
  `;
}

function GraderAssignmentModal({
  csrfToken,
  courseStaff,
}: {
  csrfToken: string;
  courseStaff: User[];
}) {
  return Modal({
    id: 'grader-assignment-modal',
    title: 'Assign instances to graders',
    body:
      courseStaff.length > 0
        ? html`
            <p>Assign instances to the following graders:</p>
            ${courseStaff.map(
              (staff) => html`
                <div class="form-check">
                  <input
                    type="checkbox"
                    id="grader-assignment-${staff.user_id}"
                    name="assigned_grader"
                    value="${staff.user_id}"
                    class="form-check-input"
                  />
                  <label class="form-check-label" for="grader-assignment-${staff.user_id}">
                    ${staff.name ? `${staff.name} (${staff.uid})` : staff.uid}
                  </label>
                </div>
              `,
            )}
            <div class="mt-3 mb-0 small alert alert-info">
              Only instances that require grading and are not yet assigned to a grader will be
              affected. If more than one grader is selected, the instances will be randomly split
              between the graders.
            </div>
          `
        : html`<p>
            There are currently no staff members with Editor permission assigned to this course
            instance.
          </p>`,
    footer: html`
      <input type="hidden" name="unsafe_assessment_question_id" value="" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <input type="hidden" name="__action" value="assign_graders" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      ${courseStaff.length > 0
        ? html`<button type="submit" class="btn btn-primary">Assign</button>`
        : ''}
    `,
  });
}
