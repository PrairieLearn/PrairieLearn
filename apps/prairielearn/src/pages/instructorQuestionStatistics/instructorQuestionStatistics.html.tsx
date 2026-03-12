import { z } from 'zod';

import { html, unsafeHtml } from '@prairielearn/html';
import { IdSchema } from '@prairielearn/zod';

import { AssessmentQuestionConfigPanel } from '../../components/AssessmentQuestionConfigPanel.js';
import { BreadcrumbsHtml } from '../../components/Breadcrumbs.js';
import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { QuestionAssessmentPicker } from '../../components/QuestionAssessmentPicker.js';
import { ScorebarHtml } from '../../components/Scorebar.js';
import type {
  AssessmentForPicker,
  AssessmentQuestionContext,
  NavQuestion,
} from '../../lib/assessment-question-context.js';
import { compiledScriptTag } from '../../lib/assets.js';
import {
  AssessmentQuestionSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  CourseInstanceSchema,
  CourseSchema,
  QuestionSchema,
  TagSchema,
  TopicSchema,
} from '../../lib/db-types.js';
import { formatFloat } from '../../lib/format.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { STAT_DESCRIPTIONS } from '../shared/assessmentStatDescriptions.js';

export const AssessmentQuestionStatsRowSchema = AssessmentQuestionSchema.extend({
  course_short_name: CourseSchema.shape.short_name,
  course_instance_short_name: CourseInstanceSchema.shape.short_name,
  assessment_label: z.string(),
  assessment_color: AssessmentSetSchema.shape.color,
  assessment_id: IdSchema,
  assessment_type: AssessmentSchema.shape.type,
  course_instance_id: IdSchema,
  qid: QuestionSchema.shape.qid,
  question_title: QuestionSchema.shape.title,
  question_topic: TopicSchema.shape.name,
  question_tags: z.array(TagSchema.shape.name),
  assessment_question_number: z.string(),
});
export type AssessmentQuestionStatsRow = z.infer<typeof AssessmentQuestionStatsRowSchema>;

export function InstructorQuestionStatistics({
  questionStatsCsvFilename,
  rows,
  resLocals,
  assessmentQuestionContext,
  assessmentsList,
  prevQuestion,
  nextQuestion,
}: {
  questionStatsCsvFilename: string;
  rows: AssessmentQuestionStatsRow[];
  resLocals: ResLocalsForPage<'instructor-question'>;
  assessmentQuestionContext?: AssessmentQuestionContext | null;
  assessmentsList?: AssessmentForPicker[] | null;
  prevQuestion?: NavQuestion | null;
  nextQuestion?: NavQuestion | null;
}) {
  const histminiOptions = { width: 60, height: 20, ymax: 1 };
  const hasAssessmentContext = assessmentQuestionContext != null;
  const currentPath = `question/${resLocals.question.id}/statistics`;

  return PageLayout({
    resLocals,
    pageTitle: 'Statistics',
    navContext: {
      type: 'instructor',
      page: 'question',
      subPage: 'statistics',
    },
    options: {
      fullWidth: !hasAssessmentContext,
      pageNote: resLocals.question.qid!,
    },
    headContent: compiledScriptTag('instructorQuestionStatisticsClient.ts'),
    content: html`
      ${hasAssessmentContext
        ? html`
            <div class="d-flex align-items-center mb-3">
              ${BreadcrumbsHtml({
                items: [
                  {
                    label:
                      assessmentQuestionContext.assessment_set.abbreviation +
                      assessmentQuestionContext.assessment.number,
                    href: `${resLocals.urlPrefix}/assessment/${assessmentQuestionContext.assessment.id}/questions`,
                  },
                  {
                    label: `${assessmentQuestionContext.number_in_alternative_group}: ${resLocals.question.title}`,
                  },
                ],
              })}

              <div class="ms-auto d-flex align-items-center gap-1">
                ${prevQuestion
                  ? html`
                      <a
                        href="${resLocals.urlPrefix}/question/${prevQuestion.question_id}/statistics?assessment_question_id=${prevQuestion.id}"
                        class="btn btn-sm btn-outline-primary"
                        aria-label="Previous question"
                      >
                        <i class="bi bi-chevron-left"></i>
                      </a>
                    `
                  : html`
                      <button
                        class="btn btn-sm btn-outline-primary"
                        disabled
                        aria-label="Previous question"
                      >
                        <i class="bi bi-chevron-left"></i>
                      </button>
                    `}
                ${nextQuestion
                  ? html`
                      <a
                        href="${resLocals.urlPrefix}/question/${nextQuestion.question_id}/statistics?assessment_question_id=${nextQuestion.id}"
                        class="btn btn-sm btn-outline-primary"
                        aria-label="Next question"
                      >
                        <i class="bi bi-chevron-right"></i>
                      </a>
                    `
                  : html`
                      <button
                        class="btn btn-sm btn-outline-primary"
                        disabled
                        aria-label="Next question"
                      >
                        <i class="bi bi-chevron-right"></i>
                      </button>
                    `}
              </div>
            </div>
          `
        : ''}

      <div class="${hasAssessmentContext ? 'row' : ''}">
        <div class="${hasAssessmentContext ? 'col-lg-9 col-sm-12' : ''}">
          ${hasAssessmentContext
            ? AssessmentQuestionStatsCard({
                assessmentQuestionContext,
                resLocals,
                histminiOptions,
              })
            : AggregateStatsTable({
                rows,
                resLocals,
                questionStatsCsvFilename,
                histminiOptions,
              })}
        </div>

        ${hasAssessmentContext || assessmentsList
          ? html`
              <div class="${hasAssessmentContext ? 'col-lg-3 col-sm-12' : ''}">
                ${assessmentsList
                  ? QuestionAssessmentPicker({
                      assessments: assessmentsList,
                      selectedAssessmentQuestionId: hasAssessmentContext
                        ? assessmentQuestionContext.assessment_question.id
                        : null,
                      currentPath,
                      urlPrefix: resLocals.urlPrefix,
                    })
                  : ''}
                ${hasAssessmentContext
                  ? AssessmentQuestionConfigPanel({
                      assessment_question: assessmentQuestionContext.assessment_question,
                      assessment: assessmentQuestionContext.assessment,
                      numberInAlternativeGroup:
                        assessmentQuestionContext.number_in_alternative_group,
                    })
                  : ''}
              </div>
            `
          : ''}
      </div>
    `,
  });
}

function AssessmentQuestionStatsCard({
  assessmentQuestionContext,
  resLocals,
  histminiOptions,
}: {
  assessmentQuestionContext: AssessmentQuestionContext;
  resLocals: ResLocalsForPage<'instructor-question'>;
  histminiOptions: { width: number; height: number; ymax: number };
}) {
  const aq = assessmentQuestionContext.assessment_question;

  return html`
    ${resLocals.authz_data.has_course_permission_edit
      ? Modal({
          title: 'Recalculate statistics',
          id: 'refreshStatsModal',
          body: html`
            Are you sure you want to recalculate statistics for this question? This cannot be
            undone.
          `,
          footer: html`
            <input type="hidden" name="__action" value="refresh_stats" />
            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="submit" class="btn btn-danger">Submit</button>
          `,
        })
      : ''}

    <div class="card mb-3">
      <div class="card-header bg-primary text-white d-flex align-items-center">
        <h2>Question statistics</h2>
        ${resLocals.authz_data.has_course_permission_edit
          ? html`
              <div class="ms-auto">
                <button
                  type="button"
                  class="btn btn-sm btn-light"
                  data-bs-toggle="modal"
                  data-bs-target="#refreshStatsModal"
                >
                  <i class="fa fa-sync" aria-hidden="true"></i> Recalculate statistics
                </button>
              </div>
            `
          : ''}
      </div>
      <div class="table-responsive">
        <table class="table table-sm mb-0" aria-label="Question statistics">
          <tbody>
            <tr>
              <th>Mean score</th>
              <td>
                ${ScorebarHtml(aq.mean_question_score ? Math.round(aq.mean_question_score) : null)}
              </td>
            </tr>
            <tr>
              <th>Discrimination</th>
              <td>${ScorebarHtml(aq.discrimination ? Math.round(aq.discrimination) : null)}</td>
            </tr>
            <tr>
              <th>Some submission (%)</th>
              <td>${formatFloat(aq.some_submission_perc, 1)}</td>
            </tr>
            <tr>
              <th>Some perfect submission (%)</th>
              <td>${formatFloat(aq.some_perfect_submission_perc, 1)}</td>
            </tr>
            <tr>
              <th>Average number of submissions</th>
              <td>${formatFloat(aq.average_number_submissions, 2)}</td>
            </tr>
            ${aq.quintile_question_scores !== null
              ? html`
                  <tr>
                    <th>Quintile scores</th>
                    <td>
                      <div
                        class="js-histmini"
                        data-data="${JSON.stringify(aq.quintile_question_scores)}"
                        data-options="${JSON.stringify({
                          ...histminiOptions,
                          ymax: 100,
                        })}"
                      ></div>
                    </td>
                  </tr>
                `
              : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function AggregateStatsTable({
  rows,
  resLocals,
  questionStatsCsvFilename,
  histminiOptions,
}: {
  rows: AssessmentQuestionStatsRow[];
  resLocals: ResLocalsForPage<'instructor-question'>;
  questionStatsCsvFilename: string;
  histminiOptions: { width: number; height: number; ymax: number };
}) {
  return html`
    <div class="card mb-4">
      <div class="card-header bg-primary text-white">
        <h1>Detailed assessment statistics for question ${resLocals.question.qid}</h1>
      </div>

      <div class="table-responsive">
        <table
          class="table table-sm table-hover tablesorter table-bordered"
          aria-label="Question statistics by assessment"
        >
          <thead>
            <tr>
              <th class="text-center">Course Instance</th>
              <th class="text-center">Assessment</th>
              ${Object.values(STAT_DESCRIPTIONS).map((stat) => {
                return html`
                  <th class="text-center" title="${stat.description}">${unsafeHtml(stat.title)}</th>
                `;
              })}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              return html`
                <tr>
                  <td>${row.course_instance_short_name}</td>
                  <td style="width: 1%">
                    <a
                      href="/pl/course_instance/${row.course_instance_id}/instructor/assessment/${row.assessment_id}/"
                      class="btn btn-badge color-${row.assessment_color}"
                    >
                      ${row.assessment_label}
                    </a>
                  </td>
                  <td class="text-center">${formatFloat(row.mean_question_score, 1)}</td>
                  <td class="text-center">${formatFloat(row.median_question_score, 1)}</td>
                  <td class="text-center">${formatFloat(row.question_score_variance, 1)}</td>
                  <td class="text-center">${formatFloat(row.discrimination, 1)}</td>
                  <td class="text-center">${formatFloat(row.some_submission_perc, 1)}</td>
                  <td class="text-center">${formatFloat(row.some_perfect_submission_perc, 1)}</td>
                  <td class="text-center">${formatFloat(row.some_nonzero_submission_perc, 1)}</td>
                  <td class="text-center">${formatFloat(row.average_first_submission_score, 2)}</td>
                  <td class="text-center">
                    ${formatFloat(row.first_submission_score_variance, 2)}
                  </td>
                  <td class="text-center">
                    ${row.first_submission_score_hist !== null
                      ? html`
                          <div
                            class="js-histmini"
                            data-options="${JSON.stringify({
                              ...histminiOptions,
                              normalize: true,
                            })}"
                            data-data="${JSON.stringify(row.first_submission_score_hist)}"
                          ></div>
                        `
                      : ''}
                  </td>
                  <td class="text-center">${formatFloat(row.average_last_submission_score, 2)}</td>
                  <td class="text-center">${formatFloat(row.last_submission_score_variance, 2)}</td>
                  <td class="text-center">
                    ${row.last_submission_score_hist !== null
                      ? html`
                          <div
                            class="js-histmini"
                            data-options="${JSON.stringify({
                              ...histminiOptions,
                              normalize: true,
                            })}"
                            data-data="${JSON.stringify(row.last_submission_score_hist)}"
                          ></div>
                        `
                      : ''}
                  </td>
                  <td class="text-center">${formatFloat(row.average_max_submission_score, 2)}</td>
                  <td class="text-center">${formatFloat(row.max_submission_score_variance, 2)}</td>
                  <td class="text-center">
                    ${row.max_submission_score_hist !== null
                      ? html`
                          <div
                            class="js-histmini"
                            data-options="${JSON.stringify({
                              ...histminiOptions,
                              normalize: true,
                            })}"
                            data-data="${JSON.stringify(row.max_submission_score_hist)}"
                          ></div>
                        `
                      : ''}
                  </td>
                  <td class="text-center">
                    ${formatFloat(row.average_average_submission_score, 2)}
                  </td>
                  <td class="text-center">
                    ${formatFloat(row.average_submission_score_variance, 2)}
                  </td>
                  <td class="text-center">
                    ${row.average_submission_score_hist !== null
                      ? html`
                          <div
                            class="js-histmini"
                            data-options="${JSON.stringify({
                              ...histminiOptions,
                              normalize: true,
                            })}"
                            data-data="${JSON.stringify(row.average_submission_score_hist)}"
                          ></div>
                        `
                      : ''}
                  </td>
                  <td class="text-center">
                    ${row.submission_score_array_averages !== null
                      ? html`
                          <div
                            class="js-histmini"
                            data-options="${JSON.stringify(histminiOptions)}"
                            data-data="${JSON.stringify(row.submission_score_array_averages)}"
                          ></div>
                        `
                      : ''}
                  </td>
                  <td class="text-center">
                    ${row.incremental_submission_score_array_averages !== null
                      ? html`
                          <div
                            class="js-histmini"
                            data-options="${JSON.stringify(histminiOptions)}"
                            data-data="${JSON.stringify(
                              row.incremental_submission_score_array_averages,
                            )}"
                          ></div>
                        `
                      : ''}
                  </td>
                  <td class="text-center">
                    ${row.assessment_type !== 'Homework'
                      ? html`
                          ${row.incremental_submission_points_array_averages != null
                            ? html`
                                <div
                                  class="js-histmini"
                                  data-options="${JSON.stringify({
                                    ...histminiOptions,
                                    ymax: row.max_points,
                                  })}"
                                  data-data="${JSON.stringify(
                                    row.incremental_submission_points_array_averages,
                                  )}"
                                ></div>
                              `
                            : ''}
                        `
                      : 'N/A'}
                  </td>
                  <td class="text-center">${formatFloat(row.average_number_submissions, 2)}</td>
                  <td class="text-center">${formatFloat(row.number_submissions_variance, 2)}</td>
                  <td class="text-center">
                    ${row.number_submissions_hist !== null
                      ? html`
                          <div
                            class="js-histmini"
                            data-options="${JSON.stringify({
                              ...histminiOptions,
                              normalize: true,
                            })}"
                            data-data="${JSON.stringify(row.number_submissions_hist)}"
                          ></div>
                        `
                      : ''}
                  </td>
                  <td class="text-center">
                    ${row.quintile_question_scores !== null
                      ? html`
                          <div
                            class="js-histmini"
                            data-options="${JSON.stringify({
                              ...histminiOptions,
                              ymax: 100,
                            })}"
                            data-data="${JSON.stringify(row.quintile_question_scores)}"
                          ></div>
                        `
                      : ''}
                  </td>
                </tr>
              `;
            })}
          </tbody>
        </table>
      </div>

      <div class="card-footer">
        <p>
          Download
          <a
            href="${resLocals.urlPrefix}/question/${resLocals.question
              .id}/statistics/${questionStatsCsvFilename}"
          >
            ${questionStatsCsvFilename}
          </a>
        </p>
        <div class="small">
          <ul>
            ${Object.keys(STAT_DESCRIPTIONS).map((stat) => {
              return html`
                <li>
                  <strong> ${unsafeHtml(STAT_DESCRIPTIONS[stat].title)}: </strong>
                  ${STAT_DESCRIPTIONS[stat].description}
                </li>
              `;
            })}
          </ul>
          <p class="mb-0">
            In the case that a student takes this assessment multiple times (e.g., if this
            assessment is a practice exam), we are calculating the above statistics by first
            averaging over all assessment instances for each student, then averaging over students.
          </p>
        </div>
      </div>
    </div>
  `;
}
