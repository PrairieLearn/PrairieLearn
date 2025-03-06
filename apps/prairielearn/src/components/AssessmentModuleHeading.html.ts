import { html } from '@prairielearn/html';

import type { AssessmentModule } from '../lib/db-types.js';

export function AssessmentModuleHeading({
  assessment_module,
}: {
  assessment_module: AssessmentModule;
}) {
  if (!assessment_module.implicit) {
    return assessment_module.heading;
  }

  return html`
    ${assessment_module.heading}
    <span class="text-muted">
      (Auto-generated from use in an assessment; add this assessment module to your infoCourse.json
      file to customize)
    </span>
  `;
}
