import { io } from 'socket.io-client';

import { decodeData, onDocumentReady } from '@prairielearn/browser-utils';

import type { JobSequenceResultsData } from '../../../src/components/JobSequenceResults.html.js';

onDocumentReady(() => {
  const socket = io();

  const { jobSequenceId, token, jobCount, jobs } = decodeData<JobSequenceResultsData>(
    'job-sequence-results-data',
  );

  socket.on('update', function () {
    window.location.reload();
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
        window.location.reload();
      }
    },
  );

  jobs.forEach((job) => {
    socket.emit(
      'joinJob',
      { job_id: job.id, token: job.token },
      function (msg: { status: JobSequenceResultsData['jobs'][0]['status']; output: string }) {
        if (msg.status !== job.status) {
          window.location.reload();
        }
        const jobOutputElement = document.getElementById(`output-${job.id}`);
        if (jobOutputElement) {
          jobOutputElement.innerHTML = msg.output;
        }
      },
    );
  });
});
