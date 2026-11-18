import { assert, describe, it } from 'vitest';

import { InstanceQuestionPoints } from './QuestionScore.js';

describe('InstanceQuestionPoints', () => {
  const savedManualOnlyQuestion = {
    instance_question: {
      auto_points: null,
      manual_points: null,
      points: 0,
      status: 'saved' as const,
      last_grader: null,
      used_for_grade: null,
    },
    assessment_question: { max_auto_points: 0, max_manual_points: 5, max_points: 5 },
    component: 'total' as const,
  };

  it('shows a saved manual-only question as pending while it requires manual grading', () => {
    const rendered = InstanceQuestionPoints({
      ...savedManualOnlyQuestion,
      instance_question: {
        ...savedManualOnlyQuestion.instance_question,
        requires_manual_grading: true,
      },
    }).toString();
    assert.include(rendered, 'pending');
  });

  it('does not show a saved manual-only question as pending once it is tagged as graded', () => {
    const rendered = InstanceQuestionPoints({
      ...savedManualOnlyQuestion,
      instance_question: {
        ...savedManualOnlyQuestion.instance_question,
        requires_manual_grading: false,
      },
    }).toString();
    assert.notInclude(rendered, 'pending');
  });
});
