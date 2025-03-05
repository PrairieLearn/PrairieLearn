import * as async from 'async';

import { formatInterval } from '@prairielearn/formatter';
import { Fragment } from '@prairielearn/preact-cjs';
import { useEffect, useState } from '@prairielearn/preact-cjs/hooks';
import { run } from '@prairielearn/run';

import { HistminiPreact } from '../../components/HistminiPreact.js';
import { IssueBadgePreact } from '../../components/IssueBadge.html.js';
import { ScorebarPreact } from '../../components/Scorebar.html.js';
import { SyncProblemButton } from '../../components/SyncProblemButton.html.js';

import type { AssessmentRow, AssessmentStatsRow } from './instructorAssessments.types.js';

type StatsOverride =
  | {
      status: 'success';
      data: AssessmentStatsRow;
    }
  | {
      status: 'error';
    };

export function InstructorAssessmentsTable({
  rows,
  assessmentIdsNeedingStatsUpdate,
  urlPrefix,
  csvFilename,
}: {
  rows: AssessmentRow[];
  assessmentIdsNeedingStatsUpdate: string[];
  urlPrefix: string;
  csvFilename: string;
}) {
  // TODO: error handling? Store either data or an error state.
  const [statsOverrides, setStatsOverrides] = useState<Record<string, StatsOverride>>({});

  // Fetch new statistics in parallel, but with a limit to avoid saturating the server.
  useEffect(() => {
    async.eachLimit(assessmentIdsNeedingStatsUpdate, 3, async (assessment_id) => {
      try {
        const response = await fetch(
          `${urlPrefix}/instance_admin/assessments/stats/${assessment_id}`,
          {
            headers: {
              Accept: 'application/json',
            },
          },
        );
        if (!response.ok) {
          throw new Error(`ERROR ${response.status} (${response.statusText})`);
        }

        const stats = await response.json();

        setStatsOverrides((prev) => ({
          ...prev,
          [assessment_id]: {
            status: 'success',
            data: stats,
          },
        }));
      } catch (err) {
        console.error(`Error fetching statistics for assessment_id=${assessment_id}`, err);
        setStatsOverrides((prev) => ({
          ...prev,
          [assessment_id]: {
            status: 'error',
          },
        }));
      }
    });
  }, [assessmentIdsNeedingStatsUpdate]);

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
                      {/** TODO: make these into components */}
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
                      <a href={`${urlPrefix}/assessment/${row.id}/`}>{row.title}</a>{' '}
                      {row.group_work && (
                        <i class="fas fa-users text-primary" aria-hidden="true"></i>
                      )}{' '}
                      <IssueBadgePreact count={row.open_issue_count} urlPrefix={urlPrefix} />
                    </td>
                    <td class="align-middle">{row.tid}</td>
                    {run(() => {
                      const override = statsOverrides[row.id];
                      if (override) {
                        return <AssessmentStats data={override} />;
                      } else {
                        return <AssessmentStats data={{ status: 'success', data: row }} />;
                      }
                    })}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div class="card-footer">
        Download{' '}
        <a href={`${urlPrefix}/instance_admin/assessments/file/${csvFilename}`}>{csvFilename}</a>{' '}
        (includes more statistics columns than displayed above)
      </div>
    </Fragment>
  );
}

export function AssessmentStats({ data }: { data: StatsOverride }) {
  const spinner = (
    <div class="spinner-border spinner-border-sm" role="status">
      <span class="sr-only">Loading...</span>
    </div>
  );

  const error = <i class="bi bi-x-circle-fill text-danger"></i>;

  return (
    <Fragment>
      <td class="text-center align-middle score-stat-number" style="white-space: nowrap;">
        {data.status === 'error'
          ? error
          : data.data.needs_statistics_update
            ? spinner
            : data.data.score_stat_number}
      </td>

      <td class="text-center align-middle score-stat-score-hist" style="white-space: nowrap;">
        {data.status === 'error' ? (
          error
        ) : data.data.needs_statistics_update ? (
          spinner
        ) : data.data.score_stat_number > 0 ? (
          <HistminiPreact data={data.data.score_stat_hist} options={{ width: 60, height: 20 }} />
        ) : (
          <Fragment>&mdash;</Fragment>
        )}
      </td>

      <td class="text-center align-middle score-stat-mean" style="white-space: nowrap;">
        {data.status === 'error' ? (
          error
        ) : data.data.needs_statistics_update ? (
          spinner
        ) : data.data.score_stat_number > 0 ? (
          <div class="d-inline-block align-middle" style="min-width: 8em; max-width: 20em;">
            <ScorebarPreact score={Math.round(data.data.score_stat_mean)} />
          </div>
        ) : (
          <Fragment>&mdash;</Fragment>
        )}
      </td>

      <td class="text-center align-middle duration-stat-mean" style="white-space: nowrap;">
        {data.status === 'error' ? (
          error
        ) : data.data.needs_statistics_update ? (
          spinner
        ) : data.data.score_stat_number > 0 ? (
          formatInterval(data.data.duration_stat_mean)
        ) : (
          <Fragment>&mdash;</Fragment>
        )}
      </td>
    </Fragment>
  );
}
