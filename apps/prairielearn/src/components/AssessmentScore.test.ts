import { assert, describe, it } from 'vitest';

import { AssessmentScoreHtml } from './AssessmentScore.js';

describe('AssessmentScore', () => {
  it('ignores saved answers once the assessment is no longer active or open', () => {
    for (const { open, active } of [
      { open: true, active: false },
      { open: false, active: true },
    ]) {
      const rendered = AssessmentScoreHtml({
        score: 50,
        gradingPending: {
          manual: false,
          saved: true,
          grading: false,
          assessment_type: 'Homework',
          open,
        },
        active,
      }).toString();
      assert.notInclude(rendered, 'Grading pending');
    }
  });
});
