import { html } from '@prairielearn/html';

import type { AssessmentSet } from '../lib/db-types.js';

export function AssessmentSetHeadingHtml({ assessment_set }: { assessment_set: AssessmentSet }) {
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

export function AssessmentSetHeading({
  assessmentSet,
}: {
  assessmentSet: Pick<AssessmentSet, 'heading' | 'implicit' | 'name'>;
}) {
  if (!assessmentSet.implicit) {
    return <>{assessmentSet.heading}</>;
  }

  return (
    <>
      {assessmentSet.name}
      <span className="text-muted">
        {' '}
        (Auto-generated from use in an assessment; edit this assessment set to customize)
      </span>
    </>
  );
}
