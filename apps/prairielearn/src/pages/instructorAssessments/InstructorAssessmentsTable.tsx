import { Fragment } from 'preact';

import { formatInterval } from '@prairielearn/formatter';

import { IssueBadgePreact } from '../../components/IssueBadgePreact.js';
import { ScorebarPreact } from '../../components/ScorebarPreact.js';
import { SyncProblemButton } from '../../components/SyncProblemButton.html.js';

import type { AssessmentRow, AssessmentStatsRow } from './instructorAssessments.types.js';

export function InstructorAssessmentsTable({
  rows,
  urlPrefix,
  csvFilename,
}: {
  rows: AssessmentRow[];
  urlPrefix: string;
  csvFilename: string;
}) {
  return (
    <Fragment>
      <div class="table-responsive">
        <table class="table table-sm table-hover" aria-label="Assessments">
          <thead>
            <tr>
              <th style="width: 1%">
                <span class="sr-only">Label</span>
              </th>
              <th>
                <span class="sr-only">Title</span>
              </th>
              <th>AID</th>
              <th class="text-center">Students</th>
              <th class="text-center">Scores</th>
              <th class="text-center">Mean Score</th>
              <th class="text-center">Mean Duration</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              return (
                <Fragment key={row.id}>
                  {row.start_new_assessment_group ? (
                    <tr>
                      <th colspan={7} scope="row">
                        {row.assessment_group_heading}
                      </th>
                    </tr>
                  ) : null}
                  <tr id={`row-${row.id}`}>
                    <td class="align-middle" style="width: 1%">
                      <span class={`badge color-${row.color}`}>{row.label}</span>
                    </td>
                    <td class="align-middle">
                      {row.sync_errors
                        ? SyncProblemButton({
                            type: 'error',
                            output: row.sync_errors,
                          })
                        : row.sync_warnings
                          ? SyncProblemButton({
                              type: 'warning',
                              output: row.sync_warnings,
                            })
                          : ''}
                      <a href={`${urlPrefix}/assessment/${row.id}/`}>
                        {row.title}
                        {row.group_work ? <i class="fas fa-users" aria-hidden="true"></i> : null}
                      </a>{' '}
                      <IssueBadgePreact count={row.open_issue_count} urlPrefix={urlPrefix} />
                    </td>
                    <td class="align-middle">{row.tid}</td>
                    <AssessmentStats row={row} />
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div class="card-footer">
        Download
        <a href={`${urlPrefix}/instance_admin/assessments/file/${csvFilename}`}>${csvFilename}</a>
        (includes more statistics columns than displayed above)
      </div>
    </Fragment>
  );
}

export function AssessmentStats({ row }: { row: AssessmentStatsRow }) {
  const spinner = (
    <div class="spinner-border spinner-border-sm" role="status">
      <span class="sr-only">Loading...</span>
    </div>
  );
  return (
    <Fragment>
      <td class="text-center align-middle score-stat-number" style="white-space: nowrap;">
        {row.needs_statistics_update ? spinner : row.score_stat_number}
      </td>

      <td class="text-center align-middle score-stat-score-hist" style="white-space: nowrap;">
        {row.needs_statistics_update ? (
          spinner
        ) : row.score_stat_number > 0 ? (
          <div
            class="js-histmini d-inline-block"
            data-data="${JSON.stringify(row.score_stat_hist)}"
            data-options="${JSON.stringify({ width: 60, height: 20 })}"
          ></div>
        ) : (
          <Fragment>&mdash;</Fragment>
        )}
      </td>

      <td class="text-center align-middle score-stat-mean" style="white-space: nowrap;">
        {row.needs_statistics_update ? (
          spinner
        ) : row.score_stat_number > 0 ? (
          <div class="d-inline-block align-middle" style="min-width: 8em; max-width: 20em;">
            <ScorebarPreact score={Math.round(row.score_stat_mean)} />
          </div>
        ) : (
          <Fragment>&mdash;</Fragment>
        )}
      </td>

      <td class="text-center align-middle duration-stat-mean" style="white-space: nowrap;">
        {row.needs_statistics_update ? (
          spinner
        ) : row.score_stat_number > 0 ? (
          formatInterval(row.duration_stat_mean)
        ) : (
          <Fragment>&mdash;</Fragment>
        )}
      </td>
    </Fragment>
  );
}
