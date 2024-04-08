import { html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { assetPath, nodeModulesAssetPath } from '../../lib/assets';

export function InstructorQuestionStatistics({ resLocals }: { resLocals: Record<string, any> }) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", {
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
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            __filename,
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
                    ${Object.keys(resLocals.stat_descriptions).map(function (stat) {
                      return html`
                        <th
                          class="text-center"
                          title="${resLocals.stat_descriptions[stat].description}"
                        >
                          ${unsafeHtml(resLocals.stat_descriptions[stat].title)}
                        </th>
                      `;
                    })}
                  </tr>
                </thead>
                <tbody>
                  ${resLocals.assessment_stats.map(function (row, i) {
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
                        <td class="text-center">
                          ${resLocals.formatFloat(row.mean_question_score, 1)}
                        </td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.median_question_score, 1)}
                        </td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.question_score_variance, 1)}
                        </td>
                        <td class="text-center">${resLocals.formatFloat(row.discrimination, 1)}</td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.some_submission_perc, 1)}
                        </td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.some_perfect_submission_perc, 1)}
                        </td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.some_nonzero_submission_perc, 1)}
                        </td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.average_first_submission_score, 2)}
                        </td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.first_submission_score_variance, 2)}
                        </td>
                        <td class="text-center">
                          ${row.first_submission_score_hist !== null
                            ? html`<div id="firstSubmissionScoreHist${i}" class="miniHist"></div>`
                            : ''}
                        </td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.average_last_submission_score, 2)}
                        </td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.last_submission_score_variance, 2)}
                        </td>
                        <td class="text-center">
                          ${row.last_submission_score_hist !== null
                            ? html`<div id="lastSubmissionScoreHist${i}" class="miniHist"></div>`
                            : ''}
                        </td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.average_max_submission_score, 2)}
                        </td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.max_submission_score_variance, 2)}
                        </td>
                        <td class="text-center">
                          ${row.max_submission_score_hist !== null
                            ? html`<div id="maxSubmissionScoreHist${i}" class="miniHist"></div>`
                            : ''}
                        </td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.average_average_submission_score, 2)}
                        </td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.average_submission_score_variance, 2)}
                        </td>
                        <td class="text-center">
                          ${row.average_submission_score_hist !== null
                            ? html`<div id="submissionScoreArray${i}" class="miniHist"></div>`
                            : ''}
                        </td>
                        <td class="text-center">
                          ${row.submission_score_array_averages !== null
                            ? html`<div id="submissionScoreArray${i}" class="miniHist"></div>`
                            : ''}
                        </td>
                        <td class="text-center">
                          ${row.incremental_submission_score_array_averages !== null
                            ? html`
                                <div
                                  id="incrementalSubmissionScoreArray${i}"
                                  class="miniHist"
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
                                      ></div>
                                    `
                                  : ''}
                              `
                            : 'N/A'}
                        </td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.average_number_submissions, 2)}
                        </td>
                        <td class="text-center">
                          ${resLocals.formatFloat(row.number_submissions_variance, 2)}
                        </td>
                        <td class="text-center">
                          ${row.number_submissions_hist !== null
                            ? html`<div id="numberSubmissionsHist${i}" class="miniHist"></div>`
                            : ''}
                        </td>
                        <td class="text-center">
                          ${row.quintile_question_scores !== null
                            ? html`
                                <div id="quintileQuestionScoresHist${i}" class="miniHist"></div>
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
                            // TODO: replace these all with 'data-' attributes
                            histmini(
                              '#firstSubmissionScoreHist${i}',
                              [${(row.first_submission_score_hist ?? []).join(',')}],
                              _.defaults({ normalize: true }, options),
                            );
                            histmini(
                              '#lastSubmissionScoreHist${i}',
                              [${(row.last_submission_score_hist ?? []).join(',')}],
                              _.defaults({ normalize: true }, options),
                            );
                            histmini(
                              '#maxSubmissionScoreHist${i}',
                              [${(row.max_submission_score_hist ?? []).join(',')}],
                              _.defaults({ normalize: true }, options),
                            );
                            histmini(
                              '#averageSubmissionScoreHist${i}',
                              [${(row.average_submission_score_hist ?? []).join(',')}],
                              _.defaults({ normalize: true }, options),
                            );
                            histmini(
                              '#submissionScoreArray${i}',
                              [${(row.submission_score_array_averages ?? []).join(',')}],
                              options,
                            );
                            histmini(
                              '#incrementalSubmissionScoreArray${i}',
                              [
                                ${(row.incremental_submission_score_array_averages ?? []).join(
                                  ',',
                                )},
                              ],
                              options,
                            );
                            histmini(
                              '#incrementalSubmissionPointsArray${i}',
                              [
                                ${(row.incremental_submission_points_array_averages ?? []).join(
                                  ',',
                                )},
                              ],
                              _.defaults({ ymax: ${row.max_points} }, options),
                            );
                            histmini(
                              '#numberSubmissionsHist${i}',
                              [${(row.number_submissions_hist ?? []).join(',')}],
                              _.defaults({ normalize: true }, options),
                            );
                            histmini(
                              '#quintileQuestionScoresHist${i}',
                              [${(row.quintile_question_scores ?? []).join(',')}],
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
                    .id}/statistics/${resLocals.questionStatsCsvFilename}"
                >
                  ${resLocals.questionStatsCsvFilename}
                </a>
              </p>
              <small>
                <ul>
                  ${Object.keys(resLocals.stat_descriptions).map(function (stat) {
                    return html`
                      <li>
                        <strong> ${unsafeHtml(resLocals.stat_descriptions[stat].title)}: </strong>
                        ${resLocals.stat_descriptions[stat].description}
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
