import { escapeHtml, html, unsafeHtml } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { z } from 'zod';

import { assetPath, nodeModulesAssetPath } from '../../lib/assets';
import { AssessmentInstanceSchema, AssessmentSchema } from '../../lib/db-types';

export const DurationStatSchema = z.object({
  median: AssessmentSchema.shape.duration_stat_median,
  min: AssessmentSchema.shape.duration_stat_min,
  max: AssessmentSchema.shape.duration_stat_max,
  mean: AssessmentSchema.shape.duration_stat_mean,
  median_mins: z.number(),
  min_mins: z.number(),
  max_mins: z.number(),
  mean_mins: z.number(),
  threshold_seconds: AssessmentSchema.shape.duration_stat_threshold_seconds,
  threshold_labels: AssessmentSchema.shape.duration_stat_threshold_labels,
  hist: AssessmentSchema.shape.duration_stat_hist,
});
export type DurationStat = z.infer<typeof DurationStatSchema>;

export const AssessmentScoreHistogramByDateSchema = z.object({
  date: z.date(),
  date_formatted: z.string(),
  number: z.string(),
  mean_score_perc: z.number(),
  histogram: z.array(z.number()),
});
type AssessmentScoreHistogramByDate = z.infer<typeof AssessmentScoreHistogramByDateSchema>;

export const UserScoreSchema = z.object({
  duration_secs: z.number(),
  score_perc: AssessmentInstanceSchema.shape.score_perc,
});
type UserScore = z.infer<typeof UserScoreSchema>;

export function InstructorAssessmentStatistics({
  resLocals,
  durationStat,
  assessmentScoreHistogramByDate,
  userScores,
}: {
  resLocals: Record<string, any>;
  durationStat: DurationStat;
  assessmentScoreHistogramByDate: AssessmentScoreHistogramByDate[];
  userScores: UserScore[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", {
          ...resLocals,
          pageTitle: 'Statistics',
        })}
        <script src="${nodeModulesAssetPath('lodash/lodash.min.js')}"></script>
        <script src="${nodeModulesAssetPath('d3/dist/d3.min.js')}"></script>
        <script src="${assetPath('localscripts/histogram.js')}"></script>
        <script src="${assetPath('localscripts/scatter.js')}"></script>
        <script src="${assetPath('localscripts/parallel_histograms.js')}"></script>
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../partials/navbar'); %>", resLocals)}
        <main id="content" class="container-fluid">
          ${renderEjs(
            __filename,
            "<%- include('../partials/assessmentSyncErrorsAndWarnings'); %>",
            resLocals,
          )}

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Score statistics
            </div>
            ${resLocals.assessment.score_stat_number > 0
              ? html`
                  <div class="card-body">
                    <div id="scoreHist" class="histogram"></div>
                    <script>
                      $(function () {
                        var data = [${escapeHtml(resLocals.assessment.score_stat_hist)}];
                        var xgrid = _.range(0, 110, 10);
                        var options = {
                          ymin: 0,
                          xlabel: 'score / %',
                          ylabel: 'number of students',
                        };
                        histogram('#scoreHist', data, xgrid, options);
                      });
                    </script>
                  </div>

                  <div class="table-responsive">
                    <table class="table table-sm table-hover">
                      <tbody>
                        <tr>
                          <td>Number of students</td>
                          <td>${resLocals.assessment.score_stat_number}</td>
                        </tr>
                        <tr>
                          <td>Mean score</td>
                          <td>${Math.round(resLocals.assessment.score_stat_mean)}%</td>
                        </tr>
                        <tr>
                          <td>Standard deviation</td>
                          <td>${Math.round(resLocals.assessment.score_stat_std)}%</td>
                        </tr>
                        <tr>
                          <td>Median score</td>
                          <td>${Math.round(resLocals.assessment.score_stat_median)}%</td>
                        </tr>
                        <tr>
                          <td>Minimum score</td>
                          <td>${Math.round(resLocals.assessment.score_stat_min)}%</td>
                        </tr>
                        <tr>
                          <td>Maximum score</td>
                          <td>${Math.round(resLocals.assessment.score_stat_max)}%</td>
                        </tr>
                        <tr>
                          <td>Number of 0%</td>
                          <td>
                            ${resLocals.assessment.score_stat_n_zero}
                            (${Math.round(resLocals.assessment.score_stat_n_zero_perc)}% of class)
                          </td>
                        </tr>
                        <tr>
                          <td>Number of 100%</td>
                          <td>
                            ${resLocals.assessment.score_stat_n_hundred}
                            (${Math.round(resLocals.assessment.score_stat_n_hundred_perc)}% of
                            class)
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div class="card-footer">
                    <small>
                      Download
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/assessment_statistics/${resLocals.scoreStatsCsvFilename}"
                        >${resLocals.scoreStatsCsvFilename}</a
                      >. Data outside of the plotted range is included in the last bin.
                    </small>
                  </div>
                `
              : html`<div class="card-body">No student data.</div> `}
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Duration statistics
            </div>

            ${resLocals.assessment.score_stat_number > 0
              ? html`
                  <div class="card-body">
                    <div id="durationHist" class="histogram"></div>
                    <script>
                      $(function () {
                        var data = [${unsafeHtml(`${durationStat.hist}`)}];
                        var xgrid = [${unsafeHtml(`${durationStat.threshold_seconds}`)}];
                        var options = {
                          ymin: 0,
                          xlabel: 'duration',
                          ylabel: 'number of students',
                          xTickLabels: [
                            ${unsafeHtml(
                              `${durationStat.threshold_labels.map(function (label) {
                                return JSON.stringify(label);
                              })}`,
                            )},
                          ],
                        };
                        histogram('#durationHist', data, xgrid, options);
                      });
                    </script>
                  </div>

                  <div class="table-responsive">
                    <table class="table table-sm table-hover">
                      <tbody>
                        <tr>
                          <td>Mean duration</td>
                          <td>${durationStat.mean}</td>
                        </tr>
                        <tr>
                          <td>Median duration</td>
                          <td>${durationStat.median}</td>
                        </tr>
                        <tr>
                          <td>Minimum duration</td>
                          <td>${durationStat.min}</td>
                        </tr>
                        <tr>
                          <td>Maximum duration</td>
                          <td>${durationStat.max}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div class="card-footer">
                    <small>
                      Download
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/assessment_statistics/${resLocals.durationStatsCsvFilename}"
                        >${resLocals.durationStatsCsvFilename}</a
                      >. Data outside of the plotted range is included in the last bin.
                    </small>
                  </div>
                `
              : html`<div class="card-body">No student data.</div>`}
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Duration versus score
            </div>

            ${resLocals.assessment.score_stat_number > 0
              ? html`
                  <div class="card-body">
                    <div id="durationScoreScatter" class="scatter"></div>
                    <script>
                      $(function () {
                        const xdata = [
                          ${unsafeHtml(
                            `${userScores.map((user) => {
                              return user.duration_secs;
                            })}`,
                          )},
                        ];
                        const ydata = [
                          ${unsafeHtml(
                            `${userScores.map((user) => {
                              return user.score_perc;
                            })}`,
                          )},
                        ];
                        const options = {
                          xgrid: [${unsafeHtml(`${durationStat.threshold_seconds}`)}],
                          ygrid: _.range(0, 110, 10),
                          xlabel: 'duration',
                          ylabel: 'score / %',
                          xTickLabels: [
                            ${unsafeHtml(
                              `${durationStat.threshold_labels.map(function (label) {
                                return JSON.stringify(label);
                              })}`,
                            )},
                          ],
                        };
                        scatter('#durationScoreScatter', xdata, ydata, options);
                      });
                    </script>
                  </div>

                  <div class="card-footer">
                    <small>
                      Each point is one student assessment. Points beyond the plot range are plotted
                      on the edge.
                    </small>
                  </div>
                `
              : html`<div class="card-body">No student data.</div>`}
          </div>

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Score statistics by
              date
            </div>

            ${resLocals.assessment.score_stat_number > 0
              ? html`
                  <div class="card-body">
                    <div
                      id="scoreHistsByDateDiv"
                      style="overflow-x: scroll; overflow-y: hidden;"
                    ></div>
                    <script>
                      $(function () {
                        var data = [
                          ${unsafeHtml(
                            `${assessmentScoreHistogramByDate.map(function (day) {
                              return JSON.stringify({
                                label: day.date_formatted,
                                mean: day.mean_score_perc,
                                histogram: day.histogram,
                              });
                            })}`,
                          )},
                        ];

                        var options = {
                          ygrid: _.range(0, 110, 10),
                          xgrid: [${escapeHtml(html`${assessmentScoreHistogramByDate.length}`)}],
                          xlabel: 'start date',
                          ylabel: 'score / %',
                          yTickLabels: _.range(100, -10, -10),
                          width: data.length * 200,
                        };
                        parallel_histograms('#scoreHistsByDateDiv', data, options);
                      });
                    </script>
                  </div>

                  <div class="card-footer">
                    <small>
                      Download
                      <a
                        href="${resLocals.urlPrefix}/assessment/${resLocals.assessment
                          .id}/assessment_statistics/${resLocals.statsByDateCsvFilename}"
                        >${resLocals.statsByDateCsvFilename}</a
                      >.
                      <br />
                      Each day shows a histogram of the scores on this assessment for that day. The
                      widths are scaled relative to the maximum value across all bins and days. The
                      thick black horizontal lines are the mean scores for each day.
                    </small>
                  </div>
                `
              : html`<div class="card-body">No student data.</div>`}
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
