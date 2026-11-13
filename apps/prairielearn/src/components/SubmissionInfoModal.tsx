import { html } from '@prairielearn/html';

import type { SubmissionInfo } from '../lib/submission-info.js';

import { Modal } from './Modal.js';

export function SubmissionInfoModal(info: SubmissionInfo) {
  const { gradingJobStats } = info;
  return Modal({
    id: `submissionInfoModal-${info.id}`,
    title: 'Submission info',
    body: html`
      <table
        class="table table-sm table-borderless two-column-description mb-0"
        aria-label="Submission info"
      >
        <tbody>
          <tr>
            <th>Submission time</th>
            <td>${info.formattedDate}</td>
          </tr>
          ${
            info.userUid
              ? html`
                  <tr>
                    <th>Submitted by</th>
                    <td>${info.userUid}</td>
                  </tr>
                `
              : ''
          }
          ${
            gradingJobStats?.grading_method === 'External'
              ? html`
                  <tr>
                    <th><span class="text-dark me-2">&bull;</span>Submit duration</th>
                    <td>${gradingJobStats.submitDuration}</td>
                  </tr>
                  <tr>
                    <th><span class="text-warning me-2">&bull;</span>Queue duration</th>
                    <td>${gradingJobStats.queueDuration}</td>
                  </tr>
                  <tr>
                    <th><span class="text-primary me-2">&bull;</span>Prepare duration</th>
                    <td>${gradingJobStats.prepareDuration}</td>
                  </tr>
                  <tr>
                    <th><span class="text-success me-2">&bull;</span>Run duration</th>
                    <td>${gradingJobStats.runDuration}</td>
                  </tr>
                  <tr>
                    <th><span class="text-danger me-2">&bull;</span>Report duration</th>
                    <td>${gradingJobStats.reportDuration}</td>
                  </tr>
                  <tr>
                    <th>Total duration</th>
                    <td>${gradingJobStats.totalDuration}</td>
                  </tr>
                `
              : ''
          }
        </tbody>
      </table>
      ${gradingJobStats ? '' : html`<p class="mt-2">This submission has not been graded.</p>`}
      ${
        gradingJobStats?.grading_method === 'External'
          ? html`
              <div class="d-flex mt-2 mb-2">
                <span
                  style="display: inline-block; width: ${gradingJobStats.phases[0]}%; height: 10px;"
                  class="bg-dark m-0"
                ></span>
                <span
                  style="display: inline-block; width: ${gradingJobStats.phases[1]}%; height: 10px;"
                  class="bg-warning m-0"
                ></span>
                <span
                  style="display: inline-block; width: ${gradingJobStats.phases[2]}%; height: 10px;"
                  class="bg-primary m-0"
                ></span>
                <span
                  style="display: inline-block; width: ${gradingJobStats.phases[3]}%; height: 10px;"
                  class="bg-success m-0"
                ></span>
                <span
                  style="display: inline-block; width: ${gradingJobStats.phases[4]}%; height: 10px;"
                  class="bg-danger m-0"
                ></span>
              </div>
              <a class="btn btn-primary mt-2" href="${info.gradingJobUrl}">
                View grading job ${info.gradingJobId}
              </a>
            `
          : ''
      }
    `,
    footer: html`
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
    `,
  });
}
