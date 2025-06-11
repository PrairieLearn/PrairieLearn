import { Fragment } from '@prairielearn/preact-cjs';

import type { AssessmentSet } from '../lib/db-types.js';
import { renderHtml } from '../lib/preact-html.js';

export function AssessmentSetHeadingPreact({ assessmentSet }: { assessmentSet: AssessmentSet }) {
  if (!assessmentSet.implicit) {
    return assessmentSet.heading;
  }

  return (
    <Fragment>
      {assessmentSet.name}
      <span class="text-muted">
        (Auto-generated from use in an assessment; add this assessment set to your infoCourse.json
        file to customize)
      </span>
    </Fragment>
  );
}

export function AssessmentSetHeading({ assessment_set }: { assessment_set: AssessmentSet }) {
  return renderHtml(<AssessmentSetHeadingPreact assessmentSet={assessment_set} />);
}
