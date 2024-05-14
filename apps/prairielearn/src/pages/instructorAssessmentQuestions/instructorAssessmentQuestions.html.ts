import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { z } from 'zod';
import { assetPath, compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import {
  AlternativeGroupSchema,
  AssessmentQuestionSchema,
  AssessmentsFormatForQuestionSchema,
  QuestionSchema,
  TagSchema,
  TopicSchema,
  ZoneSchema,
} from '../../lib/db-types.js';
import { Modal } from '../../components/Modal.html.js';

export const AssessmentQuestionRowSchema = AssessmentQuestionSchema.extend({
  alternative_group_number_choose: AlternativeGroupSchema.shape.number_choose,
  alternative_group_number: AlternativeGroupSchema.shape.number,
  alternative_group_size: z.number(),
  assessment_question_advance_score_perc: AlternativeGroupSchema.shape.advance_score_perc,
  display_name: z.string().nullable(),
  number: z.string().nullable(),
  open_issue_count: z.string().nullable(),
  other_assessments: AssessmentsFormatForQuestionSchema.nullable(),
  sync_errors_ansified: z.string().optional(),
  sync_errors: QuestionSchema.shape.sync_errors,
  sync_warnings_ansified: z.string().optional(),
  sync_warnings: QuestionSchema.shape.sync_warnings,
  topic: TopicSchema.nullable(),
  qid: QuestionSchema.shape.qid,
  start_new_zone: z.boolean().nullable(),
  start_new_alternative_group: z.boolean().nullable(),
  tags: z
    .array(
      z.object({
        color: TagSchema.shape.color,
        id: TagSchema.shape.id,
        name: TagSchema.shape.name,
      }),
    )
    .nullable(),
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
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", resLocals)}
        <script src="${nodeModulesAssetPath('lodash/lodash.min.js')}"></script>
        <script src="${nodeModulesAssetPath('d3/dist/d3.min.js')}"></script>
        <script src="${assetPath('localscripts/histmini.js')}"></script>
        ${compiledScriptTag('instructorAssessmentQuestionsClient.ts')}
      </head>
      <script></script>
      <body>
        <script>
          $(() => {
            $('[data-toggle="popover"]').popover({ sanitize: false });

            $('.js-sync-popover[data-toggle="popover"]')
              .popover({
                sanitize: false,
              })
              .on('show.bs.popover', function () {
                $($(this).data('bs.popover').getTipElement()).css('max-width', '80%');
              });
          });
        </script>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", resLocals)}
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
          ${renderEjs(
            import.meta.url,
            "<%- include('../partials/assessmentSyncErrorsAndWarnings'); %>",
            resLocals,
          )}

          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Questions
            </div>
            ${AssessmentQuestionsTable({
              questions,
              assessmentType: resLocals.assessment.type,
              urlPrefix: resLocals.urlPrefix,
              hasCourseInstancePermissionEdit:
                resLocals.authz_data.has_course_instance_permission_edit,
            })}
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
      <table class="table table-sm table-hover">
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
          ${questions.map((question, iRow) => {
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
                    ${renderEjs(import.meta.url, "<%- include('../partials/issueBadge') %>", {
                      urlPrefix,
                      count: question.open_issue_count,
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
                <td>
                  ${renderEjs(import.meta.url, "<%- include('../partials/topic'); %>", {
                    topic: question.topic,
                  })}
                </td>
                <td>
                  ${renderEjs(import.meta.url, "<%- include('../partials/tags'); %>", {
                    tags: question.tags,
                  })}
                </td>
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
                          id="attemptsHist${iRow}"
                          class="miniHist"
                          data-number-submissions="${JSON.stringify(
                            question.number_submissions_hist,
                          )}"
                        ></div>
                      `
                    : ''}
                </td>
                <script>
                  $(function () {
                    var options = {
                      width: 60,
                      height: 20,
                    };
                    histmini(
                      '#attemptsHist${iRow}',
                      $('#attemptsHist${iRow}').data('number-submissions'),
                      options,
                    );
                  });
                </script>
                <td>
                  ${question.other_assessments
                    ? question.other_assessments.map((assessment) => {
                        return html`${renderEjs(
                          import.meta.url,
                          "<%- include('../partials/assessment'); %>",
                          {
                            urlPrefix,
                            assessment,
                          },
                        )}`;
                      })
                    : ''}
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
