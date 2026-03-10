import { describe, expect, it } from 'vitest';

import type { TrackingId, ZoneAssessmentForm, ZoneQuestionBlockForm } from '../types.js';

import { getStructuralSaveValidationErrorKind } from './saveValidation.js';

function makeTrackingId(n: number): TrackingId {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as TrackingId;
}

function makeQuestion(overrides: Partial<ZoneQuestionBlockForm> = {}): ZoneQuestionBlockForm {
  return {
    trackingId: makeTrackingId(100),
    id: 'q1',
    canSubmit: [],
    canView: [],
    ...overrides,
  };
}

function makeZone(overrides: Partial<ZoneAssessmentForm> = {}): ZoneAssessmentForm {
  return {
    trackingId: makeTrackingId(1),
    lockpoint: false,
    canSubmit: [],
    canView: [],
    questions: [makeQuestion()],
    ...overrides,
  };
}

describe('getStructuralSaveValidationErrorKind', () => {
  it('returns undefined for valid zones', () => {
    expect(getStructuralSaveValidationErrorKind([makeZone()])).toBeUndefined();
  });

  it('returns zone when the first zone is a lockpoint', () => {
    expect(
      getStructuralSaveValidationErrorKind([
        makeZone({ lockpoint: true }),
        makeZone({ trackingId: makeTrackingId(2) }),
      ]),
    ).toBe('zone');
  });

});
