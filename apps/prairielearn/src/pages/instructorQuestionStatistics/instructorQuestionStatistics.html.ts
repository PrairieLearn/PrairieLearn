import { z } from 'zod';

import { html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { assetPath, nodeModulesAssetPath } from '../../lib/assets.js';
import {
  AssessmentQuestionSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  CourseInstanceSchema,
  CourseSchema,
  IdSchema,
  QuestionSchema,
} from '../../lib/db-types.js';
import { formatFloat } from '../../lib/format.js';
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
  assessment_question_number: z.string(),
});
type AssessmentQuestionStatsRow = z.infer<typeof AssessmentQuestionStatsRowSchema>;

export function InstructorQuestionStatistics({
  questionStatsCsvFilename,
  rows,
  resLocals,
}: {
  questionStatsCsvFilename: string;
  rows: AssessmentQuestionStatsRow[];
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head'); %>", {
          ...resLocals,
          pageNote: resLocals.question.qid,
        })}
        <script src="${nodeModulesAssetPath('lodash/lodash.min.js')}"></script>
        <script src="${nodeModulesAssetPath('d3/dist/d3.min.js')}"></script>
        <script src="${assetPath('localscripts/stacked_histogram.js')}"></script>
        <script src="${assetPath('localscripts/histmini.js')}"></script>
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({
              sanitize: false,
            });
          });
        </script>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            import.meta.url,
            "<%- include('../partials/questionSyncErrorsAndWarnings'); %>",
            resLocals,
          )}

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              Detailed assessment statistics for question ${resLocals.question.qid}
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover tablesorter table-bordered">
                <thead>
                  <tr>
                    <th class="text-center">Course Instance</th>
                    <th class="text-center">Assessment</th>
                    ${Object.values(STAT_DESCRIPTIONS).map((stat) => {
                      return html`
                        <th class="text-center" title="${stat.description}">
                          ${unsafeHtml(stat.title)}
                        </th>
                      `;
                    })}
                  </tr>
                </thead>
                <tbody>
                  ${rows.map(function (row, i) {
                    return html`
                      <tr>
                        <td>${row.course_instance_short_name}</td>
                        <td style="width: 1%">
                          <a
                            href="/pl/course_instance/${row.course_instance_id}/instructor/assessment/${row.assessment_id}/"
                            class="badge color-${row.assessment_color} color-hover"
                          >
                            ${row.assessment_label}
                          </a>
                        </td>
                        <td class="text-center">${formatFloat(row.mean_question_score, 1)}</td>
                        <td class="text-center">${formatFloat(row.median_question_score, 1)}</td>
                        <td class="text-center">${formatFloat(row.question_score_variance, 1)}</td>
                        <td class="text-center">${formatFloat(row.discrimination, 1)}</td>
                        <td class="text-center">${formatFloat(row.some_submission_perc, 1)}</td>
                        <td class="text-center">
                          ${formatFloat(row.some_perfect_submission_perc, 1)}
                        </td>
                        <td class="text-center">
                          ${formatFloat(row.some_nonzero_submission_perc, 1)}
                        </td>
                        <td class="text-center">
                          ${formatFloat(row.average_first_submission_score, 2)}
                        </td>
                        <td class="text-center">
                          ${formatFloat(row.first_submission_score_variance, 2)}
                        </td>
                        <td class="text-center">
                          ${row.first_submission_score_hist !== null
                            ? html`
                                <div
                                  id="firstSubmissionScoreHist${i}"
                                  class="miniHist"
                                  data-histmini-values="${JSON.stringify(
                                    row.first_submission_score_hist,
                                  )}"
                                ></div>
                              `
                            : ''}
                        </td>
                        <td class="text-center">
                          ${formatFloat(row.average_last_submission_score, 2)}
                        </td>
                        <td class="text-center">
                          ${formatFloat(row.last_submission_score_variance, 2)}
                        </td>
                        <td class="text-center">
                          ${row.last_submission_score_hist !== null
                            ? html`
                                <div
                                  id="lastSubmissionScoreHist${i}"
                                  class="miniHist"
                                  data-histmini-values="${JSON.stringify(
                                    row.last_submission_score_hist,
                                  )}"
                                ></div>
                              `
                            : ''}
                        </td>
                        <td class="text-center">
                          ${formatFloat(row.average_max_submission_score, 2)}
                        </td>
                        <td class="text-center">
                          ${formatFloat(row.max_submission_score_variance, 2)}
                        </td>
                        <td class="text-center">
                          ${row.max_submission_score_hist !== null
                            ? html`
                                <div
                                  id="maxSubmissionScoreHist${i}"
                                  class="miniHist"
                                  data-histmini-values="${JSON.stringify(
                                    row.max_submission_score_hist,
                                  )}"
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
                                  id="submissionScoreArray${i}"
                                  class="miniHist"
                                  data-histmini-values="${JSON.stringify(
                                    row.average_submission_score_hist,
                                  )}"
                                ></div>
                              `
                            : ''}
                        </td>
                        <td class="text-center">
                          ${row.submission_score_array_averages !== null
                            ? html`
                                <div
                                  id="submissionScoreArray${i}"
                                  class="miniHist"
                                  data-histmini-values="${JSON.stringify(
                                    row.submission_score_array_averages,
                                  )}"
                                ></div>
                              `
                            : ''}
                        </td>
                        <td class="text-center">
                          ${row.incremental_submission_score_array_averages !== null
                            ? html`
                                <div
                                  id="incrementalSubmissionScoreArray${i}"
                                  class="miniHist"
                                  data-histmini-values="${JSON.stringify(
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
                                        id="incrementalSubmissionPointsArray${i}"
                                        class="miniHist"
                                        data-histmini-values="${JSON.stringify(
                                          row.incremental_submission_points_array_averages,
                                        )}"
                                      ></div>
                                    `
                                  : ''}
                              `
                            : 'N/A'}
                        </td>
                        <td class="text-center">
                          ${formatFloat(row.average_number_submissions, 2)}
                        </td>
                        <td class="text-center">
                          ${formatFloat(row.number_submissions_variance, 2)}
                        </td>
                        <td class="text-center">
                          ${row.number_submissions_hist !== null
                            ? html`
                                <div
                                  id="numberSubmissionsHist${i}"
                                  class="miniHist"
                                  data-histmini-values="${JSON.stringify(
                                    row.number_submissions_hist,
                                  )}"
                                ></div>
                              `
                            : ''}
                        </td>
                        <td class="text-center">
                          ${row.quintile_question_scores !== null
                            ? html`
                                <div
                                  id="quintileQuestionScoresHist${i}"
                                  class="miniHist"
                                  data-histmini-values="${JSON.stringify(
                                    row.quintile_question_scores,
                                  )}"
                                ></div>
                              `
                            : ''}
                        </td>
                        <script>
                          $(function () {
                            const options = {
                              width: 60,
                              height: 20,
                              ymax: 1,
                            };
                            histmini(
                              '#firstSubmissionScoreHist${i}',
                              $('#firstSubmissionScoreHist${i}').data('histmini-values'),
                              _.defaults({ normalize: true }, options),
                            );
                            histmini(
                              '#lastSubmissionScoreHist${i}',
                              $('#lastSubmissionScoreHist${i}').data('histmini-values'),
                              _.defaults({ normalize: true }, options),
                            );
                            histmini(
                              '#maxSubmissionScoreHist${i}',
                              $('#maxSubmissionScoreHist${i}').data('histmini-values'),
                              _.defaults({ normalize: true }, options),
                            );
                            histmini(
                              '#averageSubmissionScoreHist${i}',
                              $('#averageSubmissionScoreHist${i}').data('histmini-values'),
                              _.defaults({ normalize: true }, options),
                            );
                            histmini(
                              '#submissionScoreArray${i}',
                              $('#submissionScoreArray${i}').data('histmini-values'),
                              options,
                            );
                            histmini(
                              '#incrementalSubmissionScoreArray${i}',
                              $('#incrementalSubmissionScoreArray${i}').data('histmini-values'),
                              options,
                            );
                            histmini(
                              '#incrementalSubmissionPointsArray${i}',
                              $('#incrementalSubmissionPointsArray${i}').data('histmini-values'),
                              _.defaults({ ymax: ${row.max_points} }, options),
                            );
                            histmini(
                              '#numberSubmissionsHist${i}',
                              $('#numberSubmissionsHist${i}').data('histmini-values'),
                              _.defaults({ normalize: true }, options),
                            );
                            histmini(
                              '#quintileQuestionScoresHist${i}',
                              $('#quintileQuestionScoresHist${i}').data('histmini-values'),
                              _.defaults({ ymax: 100 }, options),
                            );
                          });
                        </script>
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
              <small>
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
                  averaging over all assessment instances for each student, then averaging over
                  students.
                </p>
              </small>
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
