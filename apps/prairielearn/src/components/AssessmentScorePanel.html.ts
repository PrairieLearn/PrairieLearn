import { html } from '@prairielearn/html';

import type { Assessment, AssessmentInstance, AssessmentSet } from '../lib/db-types.js';
import { formatPoints } from '../lib/format.js';

import { Scorebar } from './Scorebar.html.js';

export function AssessmentScorePanel({
  assessment_instance,
  assessment_set,
  assessment,
  urlPrefix,
}: {
  assessment_instance: AssessmentInstance;
  assessment_set: AssessmentSet;
  assessment: Assessment;
  urlPrefix: string;
}) {
  return html`
    <div class="card mb-4" id="assessment-score-panel">
      <div class="card-header bg-secondary">
        <a class="text-white" href="${urlPrefix}/assessment_instance/${assessment_instance.id}/">
          ${assessment_set.name} ${assessment.number}
        </a>
      </div>
      <div class="card-body">
        <div class="d-flex justify-content-center">
          <a
            class="btn btn-info"
            href="${urlPrefix}/assessment_instance/${assessment_instance.id}/"
          >
            Assessment overview
          </a>
        </div>
      </div>
      <table class="table table-sm">
        <tbody>
          <tr>
            <td>Total points:</td>
            <td>
              ${formatPoints(assessment_instance.points)}/${formatPoints(
                assessment_instance.max_points,
              )}
            </td>
          </tr>
          <tr>
            <td>Score:</td>
            <td class="align-middle">${Scorebar(assessment_instance.score_perc)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}
