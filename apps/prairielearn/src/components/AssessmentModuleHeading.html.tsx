import { Fragment } from '@prairielearn/preact-cjs';

import type { AssessmentModule } from '../lib/db-types.js';
import { renderHtml } from '../lib/preact-html.js';

export function AssessmentModuleHeadingPreact({
  assessmentModule,
}: {
  assessmentModule: AssessmentModule;
}) {
  if (!assessmentModule.implicit || assessmentModule.heading === 'Default module') {
    return assessmentModule.heading;
  }

  return (
    <Fragment>
      {assessmentModule.name}
      <span class="text-muted">
        (Auto-generated from use in an assessment; add this assessment module to your
        infoCourse.json file to customize)
      </span>
    </Fragment>
  );
}

export function AssessmentModuleHeading({
  assessment_module,
}: {
  assessment_module: AssessmentModule;
}) {
  return renderHtml(<AssessmentModuleHeadingPreact assessmentModule={assessment_module} />);
}
