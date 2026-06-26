import { html } from '@prairielearn/html';

import type { AssessmentModule } from '../lib/db-types.js';

export function AssessmentModuleHeadingHtml({
  assessment_module,
}: {
  assessment_module: AssessmentModule;
}) {
  if (!assessment_module.implicit || assessment_module.heading === 'Default module') {
    return assessment_module.heading;
  }

  return html`
    ${assessment_module.name}
    <span class="text-muted">
      (Auto-generated from use in an assessment; edit this assessment module to customize)
    </span>
  `;
}

export function AssessmentModuleHeading({
  assessmentModule,
}: {
  assessmentModule: Pick<AssessmentModule, 'heading' | 'implicit' | 'name'>;
}) {
  if (!assessmentModule.implicit || assessmentModule.heading === 'Default module') {
    return <>{assessmentModule.heading}</>;
  }

  return (
    <>
      {assessmentModule.name}
      <span className="text-muted">
        {' '}
        (Auto-generated from use in an assessment; edit this assessment module to customize)
      </span>
    </>
  );
}
