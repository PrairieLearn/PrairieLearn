import { describe, expect, it } from 'vitest';

import type { ZoneQuestionJson } from '../../../schemas/infoAssessment.js';

import { getStableQuestionId } from './InstructorAssessmentQuestionsTable.js';

describe('getStableQuestionId', () => {
  it('returns question id when available', () => {
    const question = { id: 'addNumbers' } as ZoneQuestionJson;
    expect(getStableQuestionId(question, 0)).toBe('addNumbers');
  });

  it('returns first alternative id when question has no id but has alternatives', () => {
    const question = {
      alternatives: [{ id: 'alt1' }, { id: 'alt2' }],
    } as ZoneQuestionJson;
    expect(getStableQuestionId(question, 5)).toBe('alt1');
  });

  it('returns fallback temp id when no id or alternatives', () => {
    const question = {} as ZoneQuestionJson;
    expect(getStableQuestionId(question, 3)).toBe('temp-3');
  });

  it('prefers question id over alternatives', () => {
    const question = {
      id: 'mainQuestion',
      alternatives: [{ id: 'alt1' }],
    } as ZoneQuestionJson;
    expect(getStableQuestionId(question, 0)).toBe('mainQuestion');
  });
});
