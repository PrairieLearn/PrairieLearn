import { escapeHtml, html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { assetPath, nodeModulesAssetPath } from '../../lib/assets';

export function InstructorAssessmentStatistics({ resLocals }: { resLocals: Record<string, any> }) {
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

          <div class="card mb-4">
            <div class="card-header bg-primary text-white">
              ${resLocals.assessment_set.name} ${resLocals.assessment.number}: Score statistics
            </div>
            ${resLocals.assessment.score_stat_number > 0
              ? html`
                  <div class="card-body">
                    <div id="scoreHist" class="scoreHistogram"></div>
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
                        var data = [${escapeHtml(resLocals.duration_stat.hist)}];
                        var xgrid = [${escapeHtml(resLocals.duration_stat.threshold_seconds)}];
                        var options = {
                          ymin: 0,
                          xlabel: 'duration',
                          ylabel: 'number of students',
                          xTickLabels: [
                            ${resLocals.duration_stat.threshold_labels.forEach(function (label) {
                              `${label}`;
                            })},
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
                          <td><%= duration_stat.mean %></td>
                        </tr>
                        <tr>
                          <td>Median duration</td>
                          <td><%= duration_stat.median %></td>
                        </tr>
                        <tr>
                          <td>Minimum duration</td>
                          <td><%= duration_stat.min %></td>
                        </tr>
                        <tr>
                          <td>Maximum duration</td>
                          <td><%= duration_stat.max %></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div class="card-footer">
                    <small>
                      Download
                      <a
                        href="<%= urlPrefix %>/assessment/<%= assessment.id %>/assessment_statistics/<%= durationStatsCsvFilename %>"
                        ><%= durationStatsCsvFilename %></a
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
                          ${escapeHtml(
                            resLocals.user_scores.map((user) => {
                              return user.duration_secs;
                            }),
                          )},
                        ];
                        console.log('xdata', xdata);
                        const ydata = [
                          ${escapeHtml(
                            resLocals.user_scores.map((user) => {
                              return user.score_perc;
                            }),
                          )},
                        ];
                        const options = {
                          xgrid: [${escapeHtml(resLocals.duration_stat.threshold_seconds)}],
                          ygrid: _.range(0, 110, 10),
                          xlabel: 'duration',
                          ylabel: 'score / %',
                          xTickLabels: [
                            ${escapeHtml(
                              resLocals.duration_stat.threshold_labels.map((label) => {
                                return label;
                              }),
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
                      $(function() {
                          var data = [<% assessment_score_histogram_by_date.forEach(function(day) {
                            %>{label: '<%= day.date_formatted %>',
                               mean: '<%= day.mean_score_perc %>',
                               histogram: "<%= day.histogram %>".split(",")},<% }); %>];

                          var options = {
                              ygrid: _.range(0, 110, 10),
                              xgrid: [<%= assessment_score_histogram_by_date.length %>],
                              xlabel: 'start date',
                              ylabel: 'score / %',
                              yTickLabels: _.range(100, -10, -10),
                              width: data.length * 200
                          };
                          parallel_histograms("#scoreHistsByDateDiv", data, options);
                      });
                    </script>
                  </div>

                  <div class="card-footer">
                    <small>
                      Download
                      <a
                        href="<%= urlPrefix %>/assessment/<%= assessment.id %>/assessment_statistics/<%= statsByDateCsvFilename %>"
                        ><%= statsByDateCsvFilename %></a
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
