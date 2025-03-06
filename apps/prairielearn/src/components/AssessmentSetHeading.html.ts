import { html } from '@prairielearn/html';

import type { AssessmentSet } from '../lib/db-types.js';

export function AssessmentSetHeading({ assessment_set }: { assessment_set: AssessmentSet }) {
  return html`
    ${!assessment_set.implicit
      ? assessment_set.heading
      : html`${assessment_set.abbreviation}
          <span class="text-muted">
            (Auto-generated from use in an assessment; add this assessment set to your
            infoCourse.json file to customize)
          </span> `}
  `;
}
