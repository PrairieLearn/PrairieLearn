import { assert, describe, it } from 'vitest';

import { AssessmentScoreHtml } from './AssessmentScore.js';

describe('AssessmentScore', () => {
  const savedOnOpenHomework = {
    manual: false,
    saved: true,
    grading: false,
    assessment_type: 'Homework' as const,
    open: true,
  };

  it('tells the student to submit saved answers only while the assessment is active', () => {
    const active = AssessmentScoreHtml({
      score: 50,
      gradingPending: savedOnOpenHomework,
      active: true,
    }).toString();
    assert.include(active, 'You have saved answers that you have not submitted for grading.');

    for (const inactive of [false, null]) {
      const rendered = AssessmentScoreHtml({
        score: 50,
        gradingPending: savedOnOpenHomework,
        active: inactive,
      }).toString();
      assert.include(rendered, 'Some saved answers have not been graded.');
      assert.notInclude(rendered, 'not submitted for grading');
    }
  });
});
