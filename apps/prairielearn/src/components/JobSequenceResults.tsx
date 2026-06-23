import { type CSSProperties, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

import { formatDate } from '@prairielearn/formatter';

import type { JobSequenceResultsJob, JobSequenceResultsProps } from './JobSequenceResults.types.js';
import { JobStatus } from './JobStatus.js';

function redirectWithReferrer() {
  // Some browsers replace the referrer on reload
  // (https://issues.chromium.org/issues/41306076), so we use a query
  // parameter to preserve the original referrer across reloads.
  const redirectUrl = new URL(window.location.href);
  if (redirectUrl.searchParams.has('referrer')) {
    // If referrer is already in the URL, then we likely just got redirected
    // here. In this case, just reload the page to get the latest data.
    window.location.reload();
    return;
  }
  try {
    const referrerUrl = new URL(document.referrer);
    // Use a relative URL for the referrer if it's from the same origin.
    redirectUrl.searchParams.set(
      'referrer',
      referrerUrl.origin === window.location.origin
        ? referrerUrl.pathname + referrerUrl.search
        : document.referrer,
    );
  } catch {
    // If there's an error parsing the URL (which can happen if the referrer
    // is not a valid URL), just reload the page with an empty query
    // parameter.
    redirectUrl.searchParams.set('referrer', '');
  }
  window.location.replace(redirectUrl.toString());
}

function JobOutput({ job }: { job: JobSequenceResultsJob }) {
  const [showVerbose, setShowVerbose] = useState(false);
  const outputStyle: CSSProperties & { '--verbose-display'?: string } = {
    backgroundColor: 'black',
  };
  if (!showVerbose) outputStyle['--verbose-display'] = 'none';

  return (
    <>
      <div className="d-flex justify-content-end float-md-end">
        <div className="form-check form-switch">
          <input
            type="checkbox"
            className="form-check-input"
            id={`toggle-verbose-${job.id}`}
            checked={showVerbose}
            onChange={(event) => setShowVerbose(event.target.checked)}
          />
          <label className="form-check-label" htmlFor={`toggle-verbose-${job.id}`}>
            Show verbose messages
          </label>
        </div>
      </div>
      <pre
        id={`output-${job.id}`}
        className="text-white rounded p-3 mb-0 mt-3"
        style={outputStyle}
        // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
        dangerouslySetInnerHTML={{ __html: job.outputHtml }}
      />
    </>
  );
}

function JobSequenceResultsJob({
  authnUserUid,
  job,
  jobSequence,
  timeZone,
  userUid,
}: {
  authnUserUid: string | null;
  job: JobSequenceResultsJob;
  jobSequence: JobSequenceResultsProps['jobSequence'];
  timeZone: string;
  userUid: string | null;
}) {
  return (
    <div className="list-group">
      <li className="list-group-item">
        {jobSequence.legacy && (
          <>
            <h4 className="list-group-item-heading">
              Stage {job.number_in_sequence}: {job.description}
            </h4>
            {job.command && (
              <p className="mb-1">
                Command{' '}
                <code>
                  {job.command}
                  {job.arguments?.map((arg) => ` ${arg}`)}
                </code>
                {job.working_directory && (
                  <>
                    {' '}
                    run in <code>{job.working_directory}</code>
                  </>
                )}
              </p>
            )}
          </>
        )}
        <p className="mb-1">
          Started {job.start_date ? `at ${formatDate(job.start_date, timeZone)}` : ''}{' '}
          {userUid ? `by ${userUid}` : ''}{' '}
          {authnUserUid !== userUid ? `(really ${authnUserUid})` : ''}{' '}
          {job.finish_date && <>&mdash; finished at {formatDate(job.finish_date, timeZone)}</>}
        </p>
        <p className="mb-1">
          <JobStatus status={job.status} />{' '}
          {job.status === 'Running' && <i className="fa fa-sync fa-spin" />}
        </p>
        {jobSequence.legacy && (
          <>
            {job.status === 'Error' && job.exit_code != null && (
              <p className="mb-1">Exit code: {job.exit_code}</p>
            )}
            {job.exit_signal != null && <p className="mb-1">Exit signal: {job.exit_signal}</p>}
            {job.error_message != null && (
              <p className="mb-1">Error message: {job.error_message}</p>
            )}
          </>
        )}
        <JobOutput job={job} />
      </li>
    </div>
  );
}

export function JobSequenceResults({
  authnUserUid,
  jobs: initialJobs,
  jobSequence,
  jobSequenceToken,
  timeZone,
  userUid,
}: JobSequenceResultsProps) {
  const [jobs, setJobs] = useState(initialJobs);

  useEffect(() => {
    const socket = io();

    socket.on('update', () => {
      redirectWithReferrer();
    });
    socket.on('change:output', (msg: { job_id: string; output: string }) => {
      setJobs((currentJobs) =>
        currentJobs.map((job) =>
          job.id === msg.job_id ? { ...job, outputHtml: msg.output } : job,
        ),
      );
    });

    socket.emit(
      'joinJobSequence',
      { job_sequence_id: jobSequence.id, token: jobSequenceToken },
      (msg: { job_count: number }) => {
        if (msg.job_count !== initialJobs.length) {
          redirectWithReferrer();
        }
      },
    );

    for (const job of initialJobs) {
      socket.emit(
        'joinJob',
        { job_id: job.id, token: job.token },
        (msg: { status: JobSequenceResultsJob['status']; output: string }) => {
          if (msg.status !== job.status) {
            redirectWithReferrer();
          }
          setJobs((currentJobs) =>
            currentJobs.map((currentJob) =>
              currentJob.id === job.id ? { ...currentJob, outputHtml: msg.output } : currentJob,
            ),
          );
        },
      );
    }

    return () => {
      socket.disconnect();
    };
  }, [initialJobs, jobSequence.id, jobSequenceToken]);

  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white">
        {jobSequence.description} #{jobSequence.number}
      </div>
      {jobs.map((job) => (
        <JobSequenceResultsJob
          key={job.id}
          authnUserUid={authnUserUid}
          job={job}
          jobSequence={jobSequence}
          timeZone={timeZone}
          userUid={userUid}
        />
      ))}
    </div>
  );
}
JobSequenceResults.displayName = 'JobSequenceResults';
