import { z } from 'zod';
import { HtmlValue, html, joinHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { AssessmentQuestionSchema } from '../../../lib/db-types';
import { idsEqual } from '../../../lib/id';

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
  num_open_instances,
}: {
  resLocals: Record<string, any>;
  questions: ManualGradingQuestion[];
  num_open_instances: number;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../partials/head') %>", resLocals)}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            __filename,
            "<%- include('../../partials/assessmentSyncErrorsAndWarnings'); %>",
            resLocals,
          )}
          ${renderEjs(__filename, "<%- include('../../partials/assessmentOpenInstancesAlert') %>", {
            ...resLocals,
            num_open_instances,
          })}
          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Manual Grading Queue
            </div>

            <div class="table-responsive">
              <table id="instanceQuestionGradingTable" class="table table-sm table-hover">
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
      <td>
        <a href="${gradingUrl}">
          ${question.alternative_group_number}.${question.alternative_group_size === 1
            ? ''
            : `${question.number_in_alternative_group}.`}
          ${question.title}
        </a>
      </td>
      <td>${question.qid}</td>
      <td class="text-center">
        ${question.max_auto_points
          ? resLocals.assessment.type === 'Exam'
            ? (question.points_list || [question.max_manual_points ?? 0])
                .map((p) => p - (question.max_manual_points ?? 0))
                .join(',')
            : (question.init_points ?? 0) - (question.max_manual_points ?? 0)
          : '—'}
      </td>
      <td class="text-center">${question.max_manual_points || '—'}</td>
      <td class="text-center" data-testid="iq-to-grade-count">
        ${question.num_instance_questions_to_grade} / ${question.num_instance_questions}
      </td>
      <td>
        ${ProgressBar(question.num_instance_questions_to_grade, question.num_instance_questions)}
      </td>
      <td>
        ${joinHtml(assignedGraders, ', ')}
        ${question.num_instance_questions_unassigned > 0
          ? html`
              <small class="text-muted">
                (${question.num_instance_questions_unassigned} unassigned)
              </small>
            `
          : ''}
      </td>
      <td>${(question.actual_graders || []).map((u) => u.name ?? u.uid).join(', ')}</td>
      <td>
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
