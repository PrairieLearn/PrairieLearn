import * as async from 'async';

import { decodeData, onDocumentReady, parseHTML } from '@prairielearn/browser-utils';

import { type StatsUpdateData } from '../../src/pages/instructorAssessments/instructorAssessments.types.js';

import { histmini } from './lib/histmini.js';

const statElements = [
  '.score-stat-number',
  '.score-stat-score-hist',
  '.score-stat-mean',
  '.duration-stat-mean',
];

onDocumentReady(() => {
  updatePlots(document.body);

  const { assessmentIdsNeedingStatsUpdate, urlPrefix } =
    decodeData<StatsUpdateData>('stats-update-data');
  // Fetch new statistics in parallel, but with a limit to avoid saturating the server.
  async.eachLimit(assessmentIdsNeedingStatsUpdate, 3, async (assessment_id) => {
    try {
      const response = await fetch(
        `${urlPrefix}/instance_admin/assessments/stats/${assessment_id}`,
      );
      if (!response.ok) {
        throw new Error(`ERROR ${response.status} (${response.statusText}}`);
      }

      const newContent = parseHTML(document, await response.text());
      const row = document.getElementById(`row-${assessment_id}`);

      if (row) {
        for (const field of statElements) {
          const rowElement = row.querySelector(field);
          const newElement = newContent.querySelector(field);
          if (rowElement && newElement) rowElement.innerHTML = newElement.innerHTML;
        }

        updatePlots(row);
      }
    } catch (err) {
      console.error(`Error fetching statistics for assessment_id=${assessment_id}`, err);
      const row = document.getElementById('row-' + assessment_id);
      for (const field of statElements) {
        const rowElement = row?.querySelector(field);
        if (rowElement) rowElement.innerHTML = '<i class="bi bi-x-circle-fill text-danger"></i>';
      }
    }
  });
});

function updatePlots(container: HTMLElement) {
  container.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => histmini(element));
}
