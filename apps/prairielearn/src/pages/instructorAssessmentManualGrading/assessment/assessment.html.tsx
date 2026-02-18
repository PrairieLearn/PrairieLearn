import { z } from 'zod';

import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/react';

import { AssessmentOpenInstancesAlert } from '../../../components/AssessmentOpenInstancesAlert.js';
import { Modal } from '../../../components/Modal.js';
import { PageLayout } from '../../../components/PageLayout.js';
import { compiledScriptTag } from '../../../lib/assets.js';
import { AssessmentQuestionSchema, type User } from '../../../lib/db-types.js';
import { idsEqual } from '../../../lib/id.js';
import type { ResLocalsForPage } from '../../../lib/res-locals.js';

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
    .array(z.object({ id: z.number(), name: z.string().nullable(), uid: z.string() }))
    .nullable(),
  actual_graders: z
    .array(z.object({ id: z.number(), name: z.string().nullable(), uid: z.string() }))
    .nullable(),
  num_open_instances: z.coerce.number(),
});
type ManualGradingQuestion = z.infer<typeof ManualGradingQuestionSchema>;

export function ManualGradingAssessment({
  resLocals,
  questions,
  courseStaff,
  num_open_instances,
  adminFeaturesEnabled,
}: {
  resLocals: ResLocalsForPage<'assessment'>;
  questions: ManualGradingQuestion[];
  courseStaff: User[];
  num_open_instances: number;
  adminFeaturesEnabled: boolean;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Manual Grading',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'manual_grading',
    },
    options: {
      fullWidth: true,
    },
    headContent: html`
      ${compiledScriptTag('instructorAssessmentManualGradingAssessmentClient.ts')}
    `,
    preContent: html`
      ${resLocals.authz_data.has_course_instance_permission_edit
        ? GraderAssignmentModal({ courseStaff, csrfToken: resLocals.__csrf_token })
        : ''}
    `,
    content: (
      <>
        <AssessmentOpenInstancesAlert
          numOpenInstances={num_open_instances}
          assessmentId={resLocals.assessment.id}
          urlPrefix={resLocals.urlPrefix}
        />
        {adminFeaturesEnabled && (
          <>
            <form method="POST" id="ai-grade-all">
              <input type="hidden" name="__action" value="ai_grade_all" />
              <input type="hidden" name="__csrf_token" value={resLocals.__csrf_token} />
            </form>
            <form method="POST" id="delete-ai-grading-data">
              <input type="hidden" name="__action" value="delete_ai_grading_data" />
              <input type="hidden" name="__csrf_token" value={resLocals.__csrf_token} />
            </form>
            <form method="POST" id="export-ai-grading-statistics">
              <input type="hidden" name="__action" value="export_ai_grading_statistics" />
              <input type="hidden" name="__csrf_token" value={resLocals.__csrf_token} />
            </form>
          </>
        )}
        <div className="card mb-4">
          <div className="card-header bg-primary text-white align-items-center justify-content-between d-flex gap-2">
            <h1>
              {resLocals.assessment_set.name} {resLocals.assessment.number}: Manual Grading Queue
            </h1>
            {adminFeaturesEnabled && questions.length > 0 && (
              <div
                className="d-flex align-items-center gap-2"
                // React doesn't let us emit raw event handlers, so
                // instead we render these buttons inside a `dangerouslySetInnerHTML` block.

                // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
                dangerouslySetInnerHTML={{
                  __html: html`
                    <button
                      type="button"
                      class="btn btn-sm btn-light grading-tag-button"
                      name="export-ai-grading-statistics"
                      aria-label="Export AI grading statistics"
                      onclick="$('#export-ai-grading-statistics').submit();"
                    >
                      <i class="bi bi-download" aria-hidden="true"></i>
                      Export AI grading statistics
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-light grading-tag-button"
                      name="ai-grade-all-questions"
                      aria-label="AI grade all questions"
                      onclick="$('#ai-grade-all').submit();"
                    >
                      <i class="bi bi-stars" aria-hidden="true"></i>
                      AI grade all questions
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-light grading-tag-button"
                      name="delete-ai-grading-data"
                      aria-label="Delete all AI grading data"
                      data-bs-toggle="tooltip"
                      data-bs-title="Delete all AI grading results for this assessment's questions"
                      onclick="$('#delete-ai-grading-data').submit();"
                    >
                      Delete AI grading data
                    </button>
                  `.toString(),
                }}
              />
            )}
          </div>

          <div className="table-responsive">
            <table
              id="instanceQuestionGradingTable"
              className="table table-sm table-hover"
              aria-label="Questions for manual grading"
            >
              <thead>
                <tr>
                  <th>Question</th>
                  <th>QID</th>
                  <th>Auto Points</th>
                  <th>Manual Points</th>
                  <th colSpan={2}>Submissions to grade</th>
                  <th>Grading assigned to</th>
                  <th>Graded by</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((question) => (
                  <AssessmentQuestionRow
                    key={question.id}
                    resLocals={resLocals}
                    question={question}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </>
    ),
  });
}

function AssessmentQuestionRow({
  resLocals,
  question,
}: {
  resLocals: ResLocalsForPage<'assessment'>;
  question: ManualGradingQuestion;
}) {
  const showGradingButton =
    resLocals.authz_data.has_course_instance_permission_edit &&
    question.num_instance_questions_assigned + question.num_instance_questions_unassigned > 0;
  const currentUserName = resLocals.authz_data.user.name ?? resLocals.authz_data.user.uid;
  const otherAssignedGraders = (question.assigned_graders || [])
    .filter((u) => !idsEqual(u.id, resLocals.authz_data.user.id))
    .map((u) => u.name ?? u.uid);
  const gradingUrl = `${resLocals.urlPrefix}/assessment/${resLocals.assessment.id}/manual_grading/assessment_question/${question.id}`;

  return (
    <tr>
      <td className="align-middle">
        <a href={gradingUrl}>
          {question.alternative_group_number}.
          {question.alternative_group_size === 1 ? '' : `${question.number_in_alternative_group}.`}{' '}
          {question.title}
        </a>
        {question.manual_rubric_id != null && (
          // TODO: Fix this
          // eslint-disable-next-line jsx-a11y-x/anchor-is-valid
          <a
            href="#"
            className="ms-2 text-info"
            data-bs-toggle="tooltip"
            data-bs-title="This question uses a rubric"
          >
            <i className="fas fa-list-check" />
          </a>
        )}
      </td>
      <td className="align-middle">{question.qid}</td>
      <td className="text-center align-middle">
        {question.max_auto_points
          ? resLocals.assessment.type === 'Exam'
            ? (question.points_list || [question.max_manual_points ?? 0])
                .map((p) => p - (question.max_manual_points ?? 0))
                .join(',')
            : (question.init_points ?? 0) - (question.max_manual_points ?? 0)
          : '—'}
      </td>
      <td className="text-center align-middle">{question.max_manual_points || '—'}</td>
      <td className="text-center align-middle" data-testid="iq-to-grade-count">
        {question.num_instance_questions_to_grade} / {question.num_instance_questions}
      </td>
      <td className="align-middle">
        <ProgressBar
          partial={question.num_instance_questions_to_grade}
          total={question.num_instance_questions}
        />
      </td>
      <td className="align-middle">
        {question.num_instance_questions_assigned > 0 && (
          <>
            <strong className="bg-warning rounded px-1">{currentUserName}</strong>
            {otherAssignedGraders.length > 0 && ', '}
          </>
        )}
        {otherAssignedGraders.join(', ')}
        {question.num_instance_questions_unassigned > 0 && (
          <>
            <small className="text-muted">
              ({question.num_instance_questions_unassigned} unassigned)
            </small>
            {resLocals.authz_data.has_course_instance_permission_edit && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                data-bs-toggle="modal"
                data-bs-target="#grader-assignment-modal"
                data-assessment-question-id={question.id}
                aria-label="Assign to graders"
              >
                <i className="fas fa-pencil" />
              </button>
            )}
          </>
        )}
      </td>
      <td className="align-middle">
        {(question.actual_graders || []).map((u) => u.name ?? u.uid).join(', ')}
      </td>
      <td className="align-middle">
        {showGradingButton && (
          <a className="btn btn-xs btn-primary" href={`${gradingUrl}/next_ungraded`}>
            Grade next submission
          </a>
        )}
      </td>
    </tr>
  );
}

function ProgressBar({ partial, total }: { partial: number | null; total: number | null }) {
  if (total == null || total <= 0) return null;
  const progress = Math.floor(100 * (1 - (partial ?? 0) / total));
  return (
    <div className="progress border" style={{ minWidth: '4em', maxWidth: '10em' }}>
      <div className="progress-bar bg-light" style={{ width: `${progress}%` }} />
      <div className="progress-bar bg-danger" style={{ width: `${100 - progress}%` }} />
    </div>
  );
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
    body: renderHtml(
      courseStaff.length > 0 ? (
        <>
          <p>Assign instances to the following graders:</p>
          {courseStaff.map((staff) => (
            <div key={staff.id} className="form-check">
              <input
                type="checkbox"
                id={`grader-assignment-${staff.id}`}
                name="assigned_grader"
                value={staff.id}
                className="form-check-input"
              />
              <label className="form-check-label" htmlFor={`grader-assignment-${staff.id}`}>
                {staff.name ? `${staff.name} (${staff.uid})` : staff.uid}
              </label>
            </div>
          ))}
          <div className="mt-3 mb-0 small alert alert-info">
            Only instances that require grading and are not yet assigned to a grader will be
            affected. If more than one grader is selected, the instances will be randomly split
            between the graders.
          </div>
        </>
      ) : (
        <p>
          There are currently no staff members with Editor permission assigned to this course
          instance.
        </p>
      ),
    ),
    footer: renderHtml(
      <>
        <input type="hidden" name="unsafe_assessment_question_id" value="" />
        <input type="hidden" name="__csrf_token" value={csrfToken} />
        <input type="hidden" name="__action" value="assign_graders" />
        <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={courseStaff.length === 0}>
          Assign
        </button>
      </>,
    ),
  });
}
