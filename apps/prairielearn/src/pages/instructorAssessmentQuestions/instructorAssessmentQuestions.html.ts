import { z } from 'zod';

import { html } from '@prairielearn/html';

import { AssessmentBadge } from '../../components/AssessmentBadge.html.js';
import { HeadContents } from '../../components/HeadContents.html.js';
import { IssueBadge } from '../../components/IssueBadge.html.js';
import { Modal } from '../../components/Modal.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { TagBadgeList } from '../../components/TagBadge.html.js';
import { TopicBadge } from '../../components/TopicBadge.html.js';
import { compiledScriptTag } from '../../lib/assets.js';
import {
  AlternativeGroupSchema,
  AssessmentQuestionSchema,
  AssessmentsFormatForQuestionSchema,
  QuestionSchema,
  TagSchema,
  TopicSchema,
  ZoneSchema,
} from '../../lib/db-types.js';

export const AssessmentQuestionRowSchema = AssessmentQuestionSchema.extend({
  alternative_group_number_choose: AlternativeGroupSchema.shape.number_choose,
  alternative_group_number: AlternativeGroupSchema.shape.number,
  alternative_group_size: z.number(),
  assessment_question_advance_score_perc: AlternativeGroupSchema.shape.advance_score_perc,
  display_name: z.string().nullable(),
  number: z.string().nullable(),
  open_issue_count: z.coerce.number().nullable(),
  other_assessments: AssessmentsFormatForQuestionSchema.nullable(),
  sync_errors_ansified: z.string().optional(),
  sync_errors: QuestionSchema.shape.sync_errors,
  sync_warnings_ansified: z.string().optional(),
  sync_warnings: QuestionSchema.shape.sync_warnings,
  topic: TopicSchema,
  qid: QuestionSchema.shape.qid,
  start_new_zone: z.boolean().nullable(),
  start_new_alternative_group: z.boolean().nullable(),
  tags: TagSchema.pick({ color: true, id: true, name: true }).array().nullable(),
  title: QuestionSchema.shape.title,
  zone_best_questions: ZoneSchema.shape.best_questions,
  zone_has_best_questions: z.boolean().nullable(),
  zone_has_max_points: z.boolean().nullable(),
  zone_max_points: ZoneSchema.shape.max_points,
  zone_number_choose: ZoneSchema.shape.number_choose,
  zone_number: ZoneSchema.shape.number,
  zone_title: ZoneSchema.shape.title,
});
type AssessmentQuestionRow = z.infer<typeof AssessmentQuestionRowSchema>;

export function InstructorAssessmentQuestions({
  resLocals,
  questions,
}: {
  resLocals: Record<string, any>;
  questions: AssessmentQuestionRow[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
        ${compiledScriptTag('instructorAssessmentQuestionsClient.ts')}
      </head>
      <body>
        ${Navbar({ resLocals })}

        <main id="content" class="container-fluid">
          ${Modal({
            id: 'resetQuestionVariantsModal',
            title: 'Confirm reset question variants',
            body: html`
              <p>
                Are your sure you want to reset all current variants of this question?
                <strong>All ungraded attempts will be lost.</strong>
              </p>
              <p>Students will receive a new variant the next time they view this question.</p>
            `,
            footer: html`
              <input type="hidden" name="__action" value="reset_question_variants" />
              <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
              <input
                type="hidden"
                name="unsafe_assessment_question_id"
                class="js-assessment-question-id"
                value=""
              />
              <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-danger">Reset question variants</button>
            `,
          })}
          ${AssessmentSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            assessment: resLocals.assessment,
            courseInstance: resLocals.course_instance,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}

          <div class="row">
            <div class="col-2">
              <ul class="nav flex-column">
                <li class="nav-item">
                  <a class="nav-link disabled" href="#">Questions</a>
                </li>
                <li class="nav-item">
                  <a class="nav-link disabled" href="#">Staff</a>
                </li>
                <li class="nav-item">
                  <a class="nav-link disabled" href="#">Issues</a>
                </li>
                <li class="nav-item">
                  <a class="nav-link disabled" href="#">Sync</a>
                </li>
                <li class="nav-item">
                  <a class="nav-link disabled" href="#">Course files</a>
                </li>
                <li class="nav-item">
                  <a class="nav-link disabled" href="#">Course settings</a>
                </li>
                <li class="nav-item">
                  <a class="nav-link disabled" href="#">Course instances</a>
                </li>
                <li class="nav-item">
                  <a class="nav-link disabled" href="#"
                    >Fall 2024 <i class="bi bi-caret-down-fill"></i
                  ></a>
                </li>
                <li class="nav-item">
                  <a class="nav-link" style="padding-left: 2em" href="#"
                    ><strong>Assessments</strong></a
                  >
                </li>
                <li class="nav-item">
                  <a class="nav-link disabled" style="padding-left: 2em" href="#">Gradebook</a>
                </li>
                <li class="nav-item">
                  <a class="nav-link disabled" style="padding-left: 2em" href="#">Access</a>
                </li>
                <li class="nav-item">
                  <a class="nav-link disabled" style="padding-left: 2em" href="#">Instance files</a>
                </li>
                <li class="nav-item">
                  <a class="nav-link disabled" style="padding-left: 2em" href="#"
                    >Instance settings</a
                  >
                </li>
              </ul>
            </div>
            <div class="col-10">
              <h4 class="my-3">
                Fall 2024 &rarr; Assessments &rarr; Homework 1A
                <i class="bi bi-caret-down-fill"></i>
              </h4>
              <nav>
                <ul class="nav nav-tabs pl-nav-tabs-bar">
                  <li class="nav-item">
                    <a
                      class="nav-link d-flex align-items-center text-secondary"
                      href="/pl/course_instance/15/instructor/assessment/421/access"
                    >
                      <i class="mr-1 far fa-calendar-alt"></i>Access
                    </a>
                  </li>

                  <li class="nav-item">
                    <a
                      class="nav-link d-flex align-items-center text-secondary"
                      href="/pl/course_instance/15/instructor/assessment/421/downloads"
                    >
                      <i class="mr-1 fas fa-download"></i>Downloads
                    </a>
                  </li>

                  <li class="nav-item">
                    <a
                      class="nav-link d-flex align-items-center text-secondary"
                      href="/pl/course_instance/15/instructor/assessment/421/file_view"
                    >
                      <i class="mr-1 fa fa-edit"></i>Files
                    </a>
                  </li>

                  <li class="nav-item">
                    <a
                      class="nav-link d-flex align-items-center text-secondary"
                      href="/pl/course_instance/15/instructor/assessment/421/groups"
                    >
                      <i class="mr-1 fas fa-users"></i>Groups
                    </a>
                  </li>

                  <li class="nav-item">
                    <a
                      class="nav-link d-flex align-items-center active text-dark"
                      href="/pl/course_instance/15/instructor/assessment/421/questions"
                    >
                      <i class="mr-1 far fa-file-alt"></i>Questions
                    </a>
                  </li>

                  <li class="nav-item">
                    <a
                      class="nav-link d-flex align-items-center text-secondary"
                      href="/pl/course_instance/15/instructor/assessment/421/manual_grading"
                    >
                      <i class="mr-1 fas fa-marker"></i>Grading
                    </a>
                  </li>

                  <li class="nav-item">
                    <a
                      class="nav-link d-flex align-items-center text-secondary"
                      href="/pl/course_instance/15/instructor/assessment/421/settings"
                    >
                      <i class="mr-1 fas fa-cog"></i>Settings
                    </a>
                  </li>

                  <li class="nav-item">
                    <a
                      class="nav-link d-flex align-items-center text-secondary"
                      href="/pl/course_instance/15/instructor/assessment/421/assessment_statistics"
                    >
                      <i class="mr-1 fas fa-chart-bar"></i>Statistics
                    </a>
                  </li>

                  <li class="nav-item">
                    <a
                      class="nav-link d-flex align-items-center text-secondary"
                      href="/pl/course_instance/15/instructor/assessment/421/instances"
                    >
                      <i class="mr-1 fas fa-user-graduate"></i>Students
                    </a>
                  </li>

                  <li class="nav-item">
                    <a
                      class="nav-link d-flex align-items-center text-secondary"
                      href="/pl/course_instance/15/instructor/assessment/421/uploads"
                    >
                      <i class="mr-1 fas fa-upload"></i>Uploads
                    </a>
                  </li>
                </ul>
              </nav>

              <div class="card mb-4 mt-2">
                <div class="card-header bg-primary text-white d-flex align-items-center">
                  <h1>Questions</h1>
                </div>
                ${AssessmentQuestionsTable({
                  questions,
                  assessmentType: resLocals.assessment.type,
                  urlPrefix: resLocals.urlPrefix,
                  hasCourseInstancePermissionEdit:
                    resLocals.authz_data.has_course_instance_permission_edit,
                })}
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

function AssessmentQuestionsTable({
  questions,
  urlPrefix,
  assessmentType,
  hasCourseInstancePermissionEdit,
}: {
  questions: AssessmentQuestionRow[];
  assessmentType: string;
  urlPrefix: string;
  hasCourseInstancePermissionEdit: boolean;
}) {
  // If at least one question has a nonzero unlock score, display the Advance Score column
  const showAdvanceScorePercCol =
    questions.filter((q) => q.assessment_question_advance_score_perc !== 0).length >= 1;

  const nTableCols = showAdvanceScorePercCol ? 12 : 11;

  function maxPoints({ max_auto_points, max_manual_points, points_list, init_points }) {
    if (max_auto_points || !max_manual_points) {
      if (assessmentType === 'Exam') {
        return (points_list || [max_manual_points]).map((p) => p - max_manual_points).join(',');
      }
      if (assessmentType === 'Homework') {
        return `${init_points - max_manual_points}/${max_auto_points}`;
      }
    } else {
      return html`&mdash;`;
    }
  }

  return html`
    <div class="table-responsive">
      <table class="table table-sm table-hover" aria-label="Assessment questions">
        <thead>
          <tr>
            <th><span class="sr-only">Name</span></th>
            <th>QID</th>
            <th>Topic</th>
            <th>Tags</th>
            <th>Auto Points</th>
            <th>Manual Points</th>
            ${showAdvanceScorePercCol ? html`<th>Advance Score</th>` : ''}
            <th width="100">Mean score</th>
            <th>Num. Submissions Histogram</th>
            <th>Other Assessments</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${questions.map((question) => {
            return html`
              ${question.start_new_zone
                ? html`
                    <tr>
                      <th colspan="${nTableCols}">
                        Zone ${question.zone_number}. ${question.zone_title}
                        ${question.zone_number_choose == null
                          ? '(Choose all questions)'
                          : question.zone_number_choose === 1
                            ? '(Choose 1 question)'
                            : `(Choose ${question.zone_number_choose} questions)`}
                        ${question.zone_has_max_points
                          ? `(maximum ${question.zone_max_points} points)`
                          : ''}
                        ${question.zone_has_best_questions
                          ? `(best ${question.zone_best_questions} questions)`
                          : ''}
                      </th>
                    </tr>
                  `
                : ''}
              ${question.start_new_alternative_group && question.alternative_group_size > 1
                ? html`
                    <tr>
                      <td colspan="${nTableCols}">
                        ${question.alternative_group_number}.
                        ${question.alternative_group_number_choose == null
                          ? 'Choose all questions from:'
                          : question.alternative_group_number_choose === 1
                            ? 'Choose 1 question from:'
                            : `Choose ${question.alternative_group_number_choose} questions from:`}
                      </td>
                    </tr>
                  `
                : ''}
              <tr>
                <td>
                  <a href="${urlPrefix}/question/${question.question_id}/">
                    ${question.alternative_group_size === 1
                      ? `${question.alternative_group_number}.`
                      : html`
                          <span class="ml-3">
                            ${question.alternative_group_number}.${question.number_in_alternative_group}.
                          </span>
                        `}
                    ${question.title}
                    ${IssueBadge({
                      urlPrefix,
                      count: question.open_issue_count ?? 0,
                      issueQid: question.qid,
                    })}
                  </a>
                </td>
                <td>
                  ${question.sync_errors
                    ? html`
                        <button
                          class="btn btn-xs mr-1 js-sync-popover"
                          data-toggle="popover"
                          data-trigger="hover"
                          data-container="body"
                          data-html="true"
                          data-title="Sync Errors"
                          data-content='<pre style="background-color: black" class="text-white rounded p-3 mb-0">${question.sync_errors_ansified}</pre>'
                          data-custom-class="popover-wide"
                        >
                          <i class="fa fa-times text-danger" aria-hidden="true"></i>
                        </button>
                      `
                    : question.sync_warnings
                      ? html`
                          <button
                            class="btn btn-xs mr-1 js-sync-popover"
                            data-toggle="popover"
                            data-trigger="hover"
                            data-container="body"
                            data-html="true"
                            data-title="Sync Warnings"
                            data-content='<pre style="background-color: black" class="text-white rounded p-3 mb-0">${question.sync_warnings_ansified}</pre>'
                            data-custom-class="popover-wide"
                          >
                            <i
                              class="fa fa-exclamation-triangle text-warning"
                              aria-hidden="true"
                            ></i>
                          </button>
                        `
                      : ''}
                  ${question.display_name}
                </td>
                <td>${TopicBadge(question.topic)}</td>
                <td>${TagBadgeList(question.tags)}</td>
                <td>
                  ${maxPoints({
                    max_auto_points: question.max_auto_points,
                    max_manual_points: question.max_manual_points,
                    points_list: question.points_list,
                    init_points: question.init_points,
                  })}
                </td>
                <td>${question.max_manual_points || '—'}</td>
                ${showAdvanceScorePercCol
                  ? html`
                      <td
                        class="${question.assessment_question_advance_score_perc === 0
                          ? 'text-muted'
                          : ''}"
                        data-testid="advance-score-perc"
                      >
                        ${question.assessment_question_advance_score_perc}%
                      </td>
                    `
                  : ''}
                <td>
                  ${question.mean_question_score
                    ? `${question.mean_question_score.toFixed(3)} %`
                    : ''}
                </td>
                <td class="text-center">
                  ${question.number_submissions_hist
                    ? html`
                        <div
                          class="js-histmini"
                          data-data="${JSON.stringify(question.number_submissions_hist)}"
                          data-options="${JSON.stringify({ width: 60, height: 20 })}"
                        ></div>
                      `
                    : ''}
                </td>
                <td>
                  ${question.other_assessments?.map((assessment) =>
                    AssessmentBadge({ urlPrefix, assessment }),
                  )}
                </td>
                <td class="text-right">
                  <div class="dropdown js-question-actions">
                    <button
                      type="button"
                      class="btn btn-secondary btn-xs dropdown-toggle"
                      data-toggle="dropdown"
                      aria-haspopup="true"
                      aria-expanded="false"
                    >
                      Action <span class="caret"></span>
                    </button>

                    <div class="dropdown-menu">
                      ${hasCourseInstancePermissionEdit
                        ? html`
                            <button
                              class="dropdown-item"
                              data-toggle="modal"
                              data-target="#resetQuestionVariantsModal"
                              data-assessment-question-id="${question.id}"
                            >
                              Reset question variants
                            </button>
                          `
                        : html`
                            <button class="dropdown-item disabled" disabled>
                              Must have editor permission
                            </button>
                          `}
                    </div>
                  </div>
                </td>
              </tr>
            `;
          })}
        </tbody>
      </table>
    </div>
  `;
}
