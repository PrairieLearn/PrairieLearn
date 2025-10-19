import _ from 'lodash';
import { z } from 'zod';

import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { PageLayout } from '../../components/PageLayout.js';
import { AssessmentSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { type Assessment, AssessmentInstanceSchema, AssessmentSchema } from '../../lib/db-types.js';

export const DurationStatSchema = z.object({
  median_formatted: z.string(),
  min_formatted: z.string(),
  max_formatted: z.string(),
  mean_formatted: z.string(),
  median_minutes: z.number(),
  min_minutes: z.number(),
  max_minutes: z.number(),
  mean_minutes: z.number(),
  thresholds: AssessmentSchema.shape.duration_stat_thresholds,
  hist: AssessmentSchema.shape.duration_stat_hist,
});
export type DurationStat = z.infer<typeof DurationStatSchema>;

export const AssessmentScoreHistogramByDateSchema = z.object({
  date: z.date(),
  date_formatted: z.string(),
  number: z.number(),
  mean_score_perc: z.number(),
  histogram: z.array(z.number()),
});
type AssessmentScoreHistogramByDate = z.infer<typeof AssessmentScoreHistogramByDateSchema>;

export const UserScoreSchema = z.object({
  duration_secs: z.number(),
  score_perc: AssessmentInstanceSchema.shape.score_perc,
});
type UserScore = z.infer<typeof UserScoreSchema>;

export interface Filenames {
  scoreStatsCsvFilename: string;
  durationStatsCsvFilename: string;
  statsByDateCsvFilename: string;
}

export function InstructorAssessmentStatistics({
  resLocals,
  assessment,
  durationStat,
  assessmentScoreHistogramByDate,
  userScores,
  filenames,
}: {
  resLocals: Record<string, any>;
  assessment: Assessment;
  durationStat: DurationStat;
  assessmentScoreHistogramByDate: AssessmentScoreHistogramByDate[];
  userScores: UserScore[];
  filenames: Filenames;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Assessment Statistics',
    navContext: {
      type: 'instructor',
      page: 'assessment',
      subPage: 'assessment_statistics',
    },
    options: {
      fullWidth: true,
    },
    headContent: compiledScriptTag('instructorAssessmentStatisticsClient.ts'),
    content: html`
      ${renderHtml(
        <AssessmentSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          assessment={resLocals.assessment}
          courseInstance={resLocals.course_instance}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
      <h1 class="visually-hidden">
        ${resLocals.assessment_set.name} ${assessment.number} Statistics
      </h1>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h2>${resLocals.assessment_set.name} ${assessment.number}: Score statistics</h2>
        </div>
        ${assessment.score_stat_number > 0
          ? html`
              <div class="card-body">
                <div
                  class="js-histogram"
                  data-histogram="${JSON.stringify(assessment.score_stat_hist)}"
                  data-xgrid="${JSON.stringify(_.range(0, 110, 10))}"
                  data-options="${JSON.stringify({
                    ymin: 0,
                    xlabel: 'score / %',
                    ylabel: 'number of students',
                  })}"
                ></div>
              </div>

              <div class="table-responsive">
                <table class="table table-sm table-hover" aria-label="Assessment score statistics">
                  <tbody>
                    <tr>
                      <td>Number of students</td>
                      <td>${assessment.score_stat_number}</td>
                    </tr>
                    <tr>
                      <td>Mean score</td>
                      <td>${Math.round(assessment.score_stat_mean)}%</td>
                    </tr>
                    <tr>
                      <td>Standard deviation</td>
                      <td>${Math.round(assessment.score_stat_std)}%</td>
                    </tr>
                    <tr>
                      <td>Median score</td>
                      <td>${Math.round(assessment.score_stat_median)}%</td>
                    </tr>
                    <tr>
                      <td>Minimum score</td>
                      <td>${Math.round(assessment.score_stat_min)}%</td>
                    </tr>
                    <tr>
                      <td>Maximum score</td>
                      <td>${Math.round(assessment.score_stat_max)}%</td>
                    </tr>
                    <tr>
                      <td>Number of 0%</td>
                      <td>
                        ${assessment.score_stat_n_zero}
                        (${Math.round(assessment.score_stat_n_zero_perc)}% of class)
                      </td>
                    </tr>
                    <tr>
                      <td>Number of 100%</td>
                      <td>
                        ${assessment.score_stat_n_hundred}
                        (${Math.round(assessment.score_stat_n_hundred_perc)}% of class)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="card-footer">
                <small>
                  Download
                  <a
                    href="${resLocals.urlPrefix}/assessment/${assessment.id}/assessment_statistics/${filenames.scoreStatsCsvFilename}"
                    >${filenames.scoreStatsCsvFilename}</a
                  >. Data outside of the plotted range is included in the last bin.
                </small>
              </div>
            `
          : html`<div class="card-body">No student data.</div> `}
      </div>

      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h2>${resLocals.assessment_set.name} ${assessment.number}: Duration statistics</h2>
        </div>

        ${assessment.score_stat_number > 0
          ? html`
              <div class="card-body">
                <div
                  class="js-histogram"
                  data-histogram="${JSON.stringify(durationStat.hist)}"
                  data-xgrid="${JSON.stringify(
                    durationStat.thresholds.map((durationMs) => durationMs / 1000),
                  )}"
                  data-options="${JSON.stringify({
                    ymin: 0,
                    xlabel: 'duration',
                    ylabel: 'number of students',
                    xTickLabels: durationStat.thresholds.map(durationLabel),
                  })}"
                ></div>
              </div>

              <div class="table-responsive">
                <table
                  class="table table-sm table-hover"
                  aria-label="Assessment duration statistics"
                >
                  <tbody>
                    <tr>
                      <td>Mean duration</td>
                      <td>${durationStat.mean_formatted}</td>
                    </tr>
                    <tr>
                      <td>Median duration</td>
                      <td>${durationStat.median_formatted}</td>
                    </tr>
                    <tr>
                      <td>Minimum duration</td>
                      <td>${durationStat.min_formatted}</td>
                    </tr>
                    <tr>
                      <td>Maximum duration</td>
                      <td>${durationStat.max_formatted}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="card-footer">
                <small>
                  Download
                  <a
                    href="${resLocals.urlPrefix}/assessment/${assessment.id}/assessment_statistics/${filenames.durationStatsCsvFilename}"
                    >${filenames.durationStatsCsvFilename}</a
                  >. Data outside of the plotted range is included in the last bin.
                </small>
              </div>
            `
          : html`<div class="card-body">No student data.</div>`}
      </div>

      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h2>${resLocals.assessment_set.name} ${assessment.number}: Duration versus score</h2>
        </div>

        ${assessment.score_stat_number > 0
          ? html`
              <div class="card-body">
                <div
                  class="js-scatter"
                  data-xdata="${JSON.stringify(userScores.map((user) => user.duration_secs))}"
                  data-ydata="${JSON.stringify(userScores.map((user) => user.score_perc))}"
                  data-options="${JSON.stringify({
                    xgrid: durationStat.thresholds.map((durationMs) => durationMs / 1000),
                    ygrid: _.range(0, 110, 10),
                    xlabel: 'duration',
                    ylabel: 'score / %',
                    xTickLabels: durationStat.thresholds.map(durationLabel),
                  })}"
                ></div>
              </div>

              <div class="card-footer">
                <small>
                  Each point is one student assessment. Points beyond the plot range are plotted on
                  the edge.
                </small>
              </div>
            `
          : html`<div class="card-body">No student data.</div>`}
      </div>

      <div class="card mb-4">
        <div class="card-header bg-primary text-white">
          <h2>${resLocals.assessment_set.name} ${assessment.number}: Score statistics by date</h2>
        </div>

        ${assessment.score_stat_number > 0
          ? html`
              <div class="card-body">
                <div
                  style="overflow-x: scroll; overflow-y: hidden;"
                  class="js-parallel-histograms"
                  data-histograms="${JSON.stringify(
                    assessmentScoreHistogramByDate.map((day) => ({
                      label: day.date_formatted,
                      mean: day.mean_score_perc,
                      histogram: day.histogram,
                    })),
                  )}"
                  data-options="${JSON.stringify({
                    ygrid: _.range(0, 110, 10),
                    xgrid: assessmentScoreHistogramByDate.length,
                    xlabel: 'start date',
                    ylabel: 'score / %',
                    yTickLabels: _.range(100, -10, -10),
                    width: assessmentScoreHistogramByDate.length * 200,
                  })}"
                ></div>
              </div>

              <div class="card-footer">
                <small>
                  Download
                  <a
                    href="${resLocals.urlPrefix}/assessment/${assessment.id}/assessment_statistics/${filenames.statsByDateCsvFilename}"
                    >${filenames.statsByDateCsvFilename}</a
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
    `,
  });
}

function durationLabel(durationMs: number) {
  const days = Math.floor(durationMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor(durationMs / (60 * 60 * 1000)) % 24;
  const mins = Math.floor(durationMs / (60 * 1000)) % 60;
  const secs = Math.floor(durationMs / 1000) % 60;

  let label = '';
  if (days > 0) label += `${days}d`;
  if (hours > 0) label += `${hours}h`;
  if (mins > 0) label += `${mins}m`;
  if (secs > 0) label += `${secs}s`;
  return label || '0';
}
