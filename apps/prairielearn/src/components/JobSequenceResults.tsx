import { type CSSProperties } from 'react';

import { formatDate } from '@prairielearn/formatter';

import { ansiToHtml } from '../lib/chalk.js';
import type { JobWithToken, StaffJobSequenceWithJobs } from '../lib/server-jobs.types.js';

import { JobStatus } from './JobStatus.js';

export interface JobSequenceResultsData {
  jobSequenceId: string;
  token: string;
  jobCount: number;
  jobs: Pick<JobWithToken, 'id' | 'status' | 'token'>[];
}

/**
 * Renders the results of a job sequence.
 *
 * For live updates, the page must also render an `EncodedData` script with the
 * id `job-sequence-results-data` and import `lib/jobSequenceResults.js` in its
 * client JavaScript.
 */
export function JobSequenceResults({
  jobSequence,
  timeZone,
}: {
  jobSequence: StaffJobSequenceWithJobs;
  timeZone: string;
}) {
  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white">
        {jobSequence.description} #{jobSequence.number}
      </div>

      {jobSequence.jobs.map((job) => (
        <div key={job.id} className="list-group">
          <div className="list-group-item">
            {jobSequence.legacy ? (
              <>
                <h4 className="list-group-item-heading">
                  Stage {job.number_in_sequence}: {job.description}
                </h4>
                {job.command ? (
                  <p className="mb-1">
                    Command{' '}
                    <code>
                      {job.command}
                      {job.arguments?.map((arg) => ` ${arg}`).join('')}
                    </code>
                    {job.working_directory ? (
                      <>
                        {' '}
                        run in <code>{job.working_directory}</code>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </>
            ) : null}
            <div className="d-flex justify-content-end float-md-end">
              <div className="form-check form-switch">
                <input
                  type="checkbox"
                  className="js-toggle-verbose form-check-input"
                  id={`toggle-verbose-${job.id}`}
                  data-target-id={`output-${job.id}`}
                />
                <label className="form-check-label" htmlFor={`toggle-verbose-${job.id}`}>
                  Show verbose messages
                </label>
              </div>
            </div>
            <p className="mb-1">
              Started {job.start_date ? `at ${formatDate(job.start_date, timeZone)}` : ''}{' '}
              {jobSequence.user_uid ? `by ${jobSequence.user_uid}` : ''}{' '}
              {jobSequence.authn_user_uid !== jobSequence.user_uid
                ? `(really ${jobSequence.authn_user_uid})`
                : ''}{' '}
              {job.finish_date ? (
                <>&mdash; finished at {formatDate(job.finish_date, timeZone)}</>
              ) : null}
            </p>
            <p className="mb-1">
              <JobStatus status={job.status} />{' '}
              {job.status === 'Running' ? <i className="fa fa-sync fa-spin" /> : null}
            </p>
            {jobSequence.legacy ? (
              <>
                {job.status === 'Error' && job.exit_code != null ? (
                  <p className="mb-1">Exit code: {job.exit_code}</p>
                ) : null}
                {job.exit_signal != null ? (
                  <p className="mb-1">Exit signal: {job.exit_signal}</p>
                ) : null}
                {job.error_message != null ? (
                  <p className="mb-1">Error message: {job.error_message}</p>
                ) : null}
              </>
            ) : null}
            {/*
              `verboseToggle.ts` imperatively mutates `--verbose-display` on this
              element to show/hide verbose output. That mutation survives React
              re-renders because the prop value is a constant: React only writes a
              style property to the DOM when its value changes between renders, so
              it never reverts the toggle's change.
            */}
            <pre
              id={`output-${job.id}`}
              className="text-white rounded p-3 mb-0 mt-3"
              style={{ backgroundColor: 'black', '--verbose-display': 'none' } as CSSProperties}
              // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
              dangerouslySetInnerHTML={{ __html: ansiToHtml(job.output) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
