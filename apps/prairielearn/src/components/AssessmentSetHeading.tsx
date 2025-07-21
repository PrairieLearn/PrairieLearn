import { html } from '@prairielearn/html';

import type { AssessmentSet } from '../lib/db-types.js';

export function AssessmentSetHeading({ assessment_set }: { assessment_set: AssessmentSet }) {
  if (!assessment_set.implicit) {
    return assessment_set.heading;
  }

  return html`
    ${assessment_set.name}
    <span class="text-muted">
      (Auto-generated from use in an assessment; add this assessment set to your infoCourse.json
      file to customize)
    </span>
  `;
}
