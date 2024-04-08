import { html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { assetPath, nodeModulesAssetPath } from '../../lib/assets';

export function InstructorAssessmentQuestionStatistics({
  questionStatsCsvFilename,
  resLocals,
}: {
  questionStatsCsvFilename: string;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", resLocals)}
        <script src="${nodeModulesAssetPath('lodash/lodash.min.js')}"></script>
        <script src="${nodeModulesAssetPath('d3/dist/d3.min.js')}"></script>
        <script src="${assetPath('localscripts/scatter.js')}"></script>
        <script src="${assetPath('localscripts/histmini.js')}"></script>
      </head>
      <body>
        <script>
          $(function () {
            $('[data-toggle="popover"]').popover({ sanitize: false });
          });
        </script>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            __filename,
            "<%- include('../partials/assessmentSyncErrorsAndWarnings'); %>",
            resLocals,
          )}
          ${resLocals.authz_data.has_course_permission_edit
            ? html`
                <div
                  class="modal fade"
                  id="refreshAssessmentQuestionStatsModal"
                  tabindex="-1"
                  role="dialog"
                  aria-labelledby="refreshAssessmentQuestionStatsModalLabel"
                >
                  <div class="modal-dialog" role="document">
                    <div class="modal-content">
                      <div class="modal-header">
                        <h4 class="modal-title" id="refreshAssessmentQuestionStatsModalLabel">
                          Refresh statistics
                        </h4>
                      </div>
                      <div class="modal-body">
                        Are you sure you want to refresh all statistics for
                        <strong>
                          ${resLocals.assessment_set.name} ${resLocals.assessment.number} </strong
                        >? This cannot be undone.
                      </div>
                      <div class="modal-footer">
                        <form name="refresh-stats-form" method="POST">
                          <input type="hidden" name="__action" value="refresh_stats" />
                          <input
                            type="hidden"
                            name="__csrf_token"
                            value="${resLocals.__csrf_token}"
                          />
                          <button type="button" class="btn btn-secondary" data-dismiss="modal">
                            Cancel
                          </button>
                          <button type="submit" class="btn btn-danger">Submit</button>
                        </form>
                      </div>
                    </div>
                  </div>
                </div>
              `
            : ''}

          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Question difficulty
              vs discrimination
              <div class="ml-auto">
                <small>
                  <span class="text-light mr-2">
                    Last calculated: ${resLocals.stats_last_updated}
                  </span>
                </small>
                <button
                  type="button"
                  class="btn btn-sm btn-light"
                  data-toggle="modal"
                  data-target="#refreshAssessmentQuestionStatsModal"
                >
                  <i class="fa fa-sync" aria-hidden="true"></i> Recalculate statistics
                </button>
              </div>
            </div>

            ${resLocals.assessment.score_stat_number > 0
              ? html`
                  <div class="card-body">
                    <div id="difficultyDiscriminationScatter" class="scatter"></div>
                    <script>
                      $(function() {
                          var xdata = [<% questions.forEach(function(question) { %><%= question.mean_question_score %>,<% }); %>];
                          var ydata = [<% questions.forEach(function(question) { %><%= question.discrimination %>,<% }); %>];
                          var labels = [<% questions.forEach(function(question) { %><%= question.assessment_question_number %>,<% }); %>];
                          var options = {
                              xgrid: _.range(0, 110, 10),
                              ygrid: _.range(0, 110, 10),
                              xlabel: 'mean score / %',
                              ylabel: 'discrimination / %',
                              radius: 2,
                              topMargin: 30,
                              labels: labels
                          };
                          scatter("#difficultyDiscriminationScatter", xdata, ydata, options);
                      });
                    </script>
                  </div>
                  <div class="card-footer">
                    <small>
                      <ul>
                        <li>
                          <strong>Mean score</strong> of a question is the average score for all
                          students on the question. It is best to have a range of questions with
                          different mean scores on the test, with some easy (mean score above 90%)
                          and some hard (mean score below 50%).
                        </li>
                        <li>
                          <strong>Discrimination</strong> of a question is the correlation
                          coefficient between the scores on the question and the total assessment
                          scores. Discrimination values should be above 20%, unless a question is
                          very easy (mean score above 95%), in which case it is acceptable to have
                          lower discriminations. It is always better to have higher discriminations
                          for all questions, and a range of discriminations is not desired.
                        </li>
                      </ul>
                    </small>
                  </div>
                `
              : html`<div class="card-body">No student data.</div>`}
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Question statistics
              <div class="ml-auto">
                <small>
                  <span class="text-light mr-2">
                    Last calculated: ${resLocals.stats_last_updated}
                  </span>
                </small>
                <button
                  type="button"
                  class="btn btn-sm btn-light"
                  data-toggle="modal"
                  data-target="#refreshAssessmentQuestionStatsModal"
                >
                  <i class="fa fa-sync" aria-hidden="true"></i> Recalculate statistics
                </button>
              </div>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover tablesorter">
                <thead>
                  <tr>
                    <th class="text-center">Question</th>
                    <th class="text-center">Mean score</th>
                    <th class="text-center">Discrimination</th>
                    <th class="text-center">Auto-graded Attempts</th>
                    <th class="text-center">Quintiles</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${resLocals.questions.map(
                    (row, i) => html`
                      <tr>
                        <td>
                          <a href="${resLocals.urlPrefix}/question/${row.question_id}/">
                            ${row.assessment_question_number}. ${row.question_title}
                          </a>
                        </td>
                        <td class="text-center align-middle">
                          ${renderEjs(__filename, "<%- include('../partials/scorebar') %>", {
                            score: Math.round(row.mean_question_score),
                          })}
                        </td>
                        <td class="text-center align-middle">
                          ${renderEjs(__filename, "<%- include('../partials/scorebar') %>", {
                            score: Math.round(row.discrimination),
                          })}
                        </td>
                        <td class="text-center">
                          ${row.max_auto_points > 0 ||
                          row.max_manual_points === 0 ||
                          row.average_number_submissions > 0
                            ? resLocals.formatFloat(row.average_number_submissions)
                            : html`&mdash;`}
                        </td>
                        ${row.number > 0
                          ? html`
                              <td class="text-center">
                                <div id="scoreHist${i}" class="miniHist"></div>
                              </td>
                              <script>
                                $(function () {
                                  // TODO: Store data on 'data-' attribute
                                  var data = [${row.quintile_question_scores.join(',')}];
                                  var options = {
                                    width: 60,
                                    height: 20,
                                    ymax: 100,
                                  };
                                  histmini('#scoreHist${i}', data, options);
                                });
                              </script>
                            `
                          : html`<td class="text-center"></td>`}
                        <td class="align-middle text-nowrap" style="width: 1em;">
                          ${resLocals.authz_data.has_course_instance_permission_edit
                            ? html`
                                <a
                                  class="btn btn-xs btn-primary"
                                  href="<%= urlPrefix %>/assessment/<%= assessment.id %>/manual_grading/assessment_question/<%= row.id %>"
                                >
                                  Manual grading
                                </a>
                              `
                            : ''}
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
            <div class="card-footer">
              <p>
                Download
                <a
                  href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                    .id}/question_statistics/${questionStatsCsvFilename}"
                >
                  ${questionStatsCsvFilename}
                </a>
              </p>
              <small>
                <ul>
                  <li>
                    <strong>Mean score</strong> of a question is the average score for all students
                    on the question. It is best to have a range of questions with different mean
                    scores on the test, with some easy (mean score above 90%) and some hard (mean
                    score below 50%).
                  </li>
                  <li>
                    <strong>Discrimination</strong> of a question is the correlation coefficient
                    between the scores on the question and the total assessment scores.
                    Discrimination values should be above 20%, unless a question is very easy (mean
                    score above 95%), in which case it is acceptable to have lower discriminations.
                    It is always better to have higher discriminations for all questions, and a
                    range of discriminations is not desired.
                  </li>
                  <li>
                    <strong>Auto-graded Attempts</strong> for a question is the average number of
                    auto-graded attempts made per student at the question.
                  </li>
                  <li>
                    <strong>Quintiles</strong> shows the average scores on the question for students
                    in the lowest 20% of the class, the next 20%, etc, where the quintiles are
                    determined by total assessment score. Good questions should have very low scores
                    for the lowest quintile (the left-most), and very high scores for the highest
                    quintile (the right-most). This is essentially a graphical representation of the
                    discrimination.
                  </li>
                </ul>
              </small>
            </div>
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Detailed question
              statistics
              <div class="ml-auto">
                <small>
                  <span class="text-light mr-2">
                    Last calculated: ${resLocals.stats_last_updated}
                  </span>
                </small>
                <button
                  type="button"
                  class="btn btn-sm btn-light"
                  data-toggle="modal"
                  data-target="#refreshAssessmentQuestionStatsModal"
                >
                  <i class="fa fa-sync" aria-hidden="true"></i> Recalculate statistics
                </button>
              </div>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover tablesorter table-bordered">
                <thead>
                  <tr>
                    <th class="text-center">Question</th>
                    ${Object.keys(resLocals.stat_descriptions).map(function (stat) {
                      if (
                        stat !== 'INCREMENTAL_SUBMISSION_SCORE_POINTS_AVERAGES' ||
                        resLocals.assessment.type !== 'Homework'
                      ) {
                        // We use `unsafeHtml` for the description below because some
                        // contain raw HTML. This is safe, as none of this is user-controlled.
                        return html`
                          <th
                            class="text-center"
                            title="${resLocals.stat_descriptions[stat].description}"
                          >
                            ${unsafeHtml(resLocals.stat_descriptions[stat].title)}
                          </th>
                        `;
                      }
                    })}
                  </tr>
                </thead>
                <tbody>
                  ${resLocals.questions.map(function (row, i) {
                    return html`
                      <tr>
                        <td style="white-space: nowrap;">
                          <a href="${resLocals.urlPrefix}/question/${row.question_id}/">
                            ${row.assessment_question_number}. ${row.qid}
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
                        ${row.max_auto_points > 0 || row.max_manual_points === 0
                          ? html`
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
                                  ? html`
                                      <div id="firstSubmissionScoreHist${i}" class="miniHist"></div>
                                    `
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
                                  ? html`
                                      <div id="lastSubmissionScoreHist${i}" class="miniHist"></div>
                                    `
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
                                  ? html`
                                      <div id="maxSubmissionScoreHist${i}" class="miniHist"></div>
                                    `
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
                                  ? html`
                                      <div id="submissionScoreArray${i}" class="miniHist"></div>
                                    `
                                  : ''}
                              </td>
                              <td class="text-center">
                                ${row.submission_score_array_averages !== null
                                  ? html`
                                      <div id="submissionScoreArray${i}" class="miniHist"></div>
                                    `
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
                              ${resLocals.assessment.type !== 'Homework'
                                ? html`
                                    <td class="text-center">
                                      ${row.incremental_submission_points_array_averages != null
                                        ? html`
                                            <div
                                              id="incrementalSubmissionPointsArray${i}"
                                              class="miniHist"
                                            ></div>
                                          `
                                        : ''}
                                    </td>
                                  `
                                : ''}
                              <td class="text-center">
                                ${resLocals.formatFloat(row.average_number_submissions, 2)}
                              </td>
                              <td class="text-center">
                                ${resLocals.formatFloat(row.number_submissions_variance, 2)}
                              </td>
                              <td class="text-center">
                                ${row.number_submissions_hist !== null
                                  ? html`
                                      <div id="numberSubmissionsHist${i}" class="miniHist"></div>
                                    `
                                  : ''}
                              </td>
                              <td class="text-center">
                                ${row.quintile_question_scores !== null
                                  ? html`
                                      <div
                                        id="quintileQuestionScoresHist${i}"
                                        class="miniHist"
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
                              </script>
                            `
                          : html`
                              <td
                                class="text-center"
                                colspan="${resLocals.assessment.type === 'Homework' ? 21 : 22}"
                              >
                                Manually-graded question
                              </td>
                            `}
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
                  href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                    .id}/question_statistics/${questionStatsCsvFilename}"
                >
                  ${questionStatsCsvFilename}
                </a>
              </p>
              <small>
                <ul>
                  ${Object.keys(resLocals.stat_descriptions).map(function (stat) {
                    return html`
                      <li>
                        <strong>${unsafeHtml(resLocals.stat_descriptions[stat].title)}: </strong>
                        ${unsafeHtml(resLocals.stat_descriptions[stat].description)}
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
