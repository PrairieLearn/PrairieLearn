import { io } from 'socket.io-client';

import { decodeData, onDocumentReady } from '@prairielearn/browser-utils';

import type { JobSequenceResultsData } from '../../../src/components/JobSequenceResults.js';

import './verboseToggle.js';

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

onDocumentReady(() => {
  const socket = io();

  const { jobSequenceId, token, jobCount, jobs } = decodeData<JobSequenceResultsData>(
    'job-sequence-results-data',
  );

  socket.on('update', function () {
    redirectWithReferrer();
  });
  socket.on('change:output', function (msg) {
    const jobOutputElement = document.getElementById(`output-${msg.job_id}`);
    if (jobOutputElement) {
      jobOutputElement.innerHTML = msg.output;
    }
  });

  // Join the rooms for the job_sequence and for each individual job.
  // Check return values for a change that happened since we rendered the page
  // and reload if anything changed. This avoids the race condition where
  // jobs change between page render and socket activation.

  socket.emit(
    'joinJobSequence',
    { job_sequence_id: jobSequenceId, token },
    function (msg: { job_count: number }) {
      if (msg.job_count !== jobCount) {
        redirectWithReferrer();
      }
    },
  );

  jobs.forEach((job) => {
    socket.emit(
      'joinJob',
      { job_id: job.id, token: job.token },
      function (msg: { status: JobSequenceResultsData['jobs'][0]['status']; output: string }) {
        if (msg.status !== job.status) {
          redirectWithReferrer();
        }
        const jobOutputElement = document.getElementById(`output-${job.id}`);
        if (jobOutputElement) {
          jobOutputElement.innerHTML = msg.output;
        }
      },
    );
  });
});
