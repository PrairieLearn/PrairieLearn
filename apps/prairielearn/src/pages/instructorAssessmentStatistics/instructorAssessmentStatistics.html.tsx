import { range } from 'es-toolkit';
import { z } from 'zod';

import { SECOND_IN_MILLISECONDS, formatDateYMD, formatInterval } from '@prairielearn/formatter';
import { html } from '@prairielearn/html';
import { DateFromISOString } from '@prairielearn/zod';

import { PageLayout } from '../../components/PageLayout.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { type Assessment, AssessmentInstanceSchema } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export const AssessmentScoreHistogramByDateSchema = z.object({
  date: DateFromISOString,
  number: z.number(),
  mean_score_perc: z.number(),
  histogram: z.array(z.number()),
});
type AssessmentScoreHistogramByDate = z.infer<typeof AssessmentScoreHistogramByDateSchema>;

export const UserScoreSchema = z.object({
  duration: AssessmentInstanceSchema.shape.duration,
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
  assessmentScoreHistogramByDate,
  userScores,
  filenames,
}: {
  resLocals: ResLocalsForPage<'assessment'>;
  assessment: Assessment;
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
                  data-xgrid="${JSON.stringify(range(0, 110, 10))}"
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
                        (${Math.round(assessment.score_stat_n_zero_perc)}% of
                        ${assessment.score_stat_number})
                      </td>
                    </tr>
                    <tr>
                      <td>Number of 100%</td>
                      <td>
                        ${assessment.score_stat_n_hundred}
                        (${Math.round(assessment.score_stat_n_hundred_perc)}% of
                        ${assessment.score_stat_number})
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
                  data-histogram="${JSON.stringify(assessment.duration_stat_hist)}"
                  data-xgrid="${JSON.stringify(
                    assessment.duration_stat_thresholds.map(
                      (durationMs) => durationMs / SECOND_IN_MILLISECONDS,
                    ),
                  )}"
                  data-options="${JSON.stringify({
                    ymin: 0,
                    xlabel: 'duration',
                    ylabel: 'number of students',
                    xTickLabels: assessment.duration_stat_thresholds.map(durationLabel),
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
                      <td>${formatInterval(assessment.duration_stat_mean)}</td>
                    </tr>
                    <tr>
                      <td>Median duration</td>
                      <td>${formatInterval(assessment.duration_stat_median)}</td>
                    </tr>
                    <tr>
                      <td>Minimum duration</td>
                      <td>${formatInterval(assessment.duration_stat_min)}</td>
                    </tr>
                    <tr>
                      <td>Maximum duration</td>
                      <td>${formatInterval(assessment.duration_stat_max)}</td>
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
                  data-xdata="${JSON.stringify(
                    userScores.map((user) => (user.duration ?? 0) / SECOND_IN_MILLISECONDS),
                  )}"
                  data-ydata="${JSON.stringify(userScores.map((user) => user.score_perc))}"
                  data-options="${JSON.stringify({
                    xgrid: assessment.duration_stat_thresholds.map(
                      (durationMs) => durationMs / SECOND_IN_MILLISECONDS,
                    ),
                    ygrid: range(0, 110, 10),
                    xlabel: 'duration',
                    ylabel: 'score / %',
                    xTickLabels: assessment.duration_stat_thresholds.map(durationLabel),
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
                      // The date is already extracted from the timestamp in the
                      // query and returned as UTC, so we can safely format it
                      // without worrying about timezones here.
                      label: formatDateYMD(day.date, 'UTC'),
                      mean: day.mean_score_perc,
                      histogram: day.histogram,
                    })),
                  )}"
                  data-options="${JSON.stringify({
                    ygrid: range(0, 110, 10),
                    xgrid: assessmentScoreHistogramByDate.length,
                    xlabel: 'start date',
                    ylabel: 'score / %',
                    yTickLabels: range(100, -10, -10),
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
  return formatInterval(durationMs).replaceAll(' ', '');
}
