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

  it('reports saved answers while the student can still have them graded', () => {
    const rendered = AssessmentScoreHtml({
      score: 50,
      gradingPending: savedOnOpenHomework,
      active: true,
    }).toString();
    assert.include(rendered, 'You have saved answers that you have not submitted for grading.');
  });

  it('ignores saved answers once the assessment is no longer active or open', () => {
    for (const { open, active } of [
      { open: true, active: false },
      { open: false, active: true },
    ]) {
      const rendered = AssessmentScoreHtml({
        score: 50,
        gradingPending: { ...savedOnOpenHomework, open },
        active,
      }).toString();
      assert.notInclude(rendered, 'Grading pending');
    }
  });

  it('still reports manual grading on an inactive assessment without mentioning saved answers', () => {
    const rendered = AssessmentScoreHtml({
      score: 50,
      gradingPending: { ...savedOnOpenHomework, manual: true },
      active: false,
    }).toString();
    assert.include(rendered, 'Some answers are waiting for manual grading.');
    assert.notInclude(rendered, 'saved answers');
  });
});
