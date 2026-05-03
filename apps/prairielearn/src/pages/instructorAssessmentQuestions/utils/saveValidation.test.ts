import { describe, expect, it } from 'vitest';

import type {
  QuestionAlternativeForm,
  TrackingId,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../types.js';

import { getStructuralSaveValidationErrorKind } from './saveValidation.js';

function makeTrackingId(n: number): TrackingId {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as TrackingId;
}

function makeAlternative(
  overrides: Partial<QuestionAlternativeForm> = {},
): QuestionAlternativeForm {
  return {
    trackingId: makeTrackingId(200),
    id: 'alt1',
    canSubmit: [],
    canView: [],
    ...overrides,
  } as QuestionAlternativeForm;
}

function makeQuestion(overrides: Partial<ZoneQuestionBlockForm> = {}): ZoneQuestionBlockForm {
  return {
    trackingId: makeTrackingId(100),
    id: 'q1',
    canSubmit: [],
    canView: [],
    ...overrides,
  } as ZoneQuestionBlockForm;
}

function makeZone(overrides: Partial<ZoneAssessmentForm> = {}): ZoneAssessmentForm {
  return {
    trackingId: makeTrackingId(1),
    lockpoint: false,
    canSubmit: [],
    canView: [],
    questions: [makeQuestion({ autoPoints: 10 })],
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

  describe('questionPoints', () => {
    it('returns questionPoints when a standalone question has no points', () => {
      expect(
        getStructuralSaveValidationErrorKind([makeZone({ questions: [makeQuestion()] })]),
      ).toBe('questionPoints');
    });

    it('returns undefined when a standalone question has autoPoints', () => {
      expect(
        getStructuralSaveValidationErrorKind([
          makeZone({ questions: [makeQuestion({ autoPoints: 5 })] }),
        ]),
      ).toBeUndefined();
    });

    it('returns undefined when a standalone question has manualPoints', () => {
      expect(
        getStructuralSaveValidationErrorKind([
          makeZone({ questions: [makeQuestion({ manualPoints: 5 })] }),
        ]),
      ).toBeUndefined();
    });

    it('returns undefined when a standalone question has points', () => {
      expect(
        getStructuralSaveValidationErrorKind([
          makeZone({ questions: [makeQuestion({ points: 5 })] }),
        ]),
      ).toBeUndefined();
    });

    it('treats zero as a valid points value', () => {
      expect(
        getStructuralSaveValidationErrorKind([
          makeZone({ questions: [makeQuestion({ points: 0 })] }),
        ]),
      ).toBeUndefined();
      expect(
        getStructuralSaveValidationErrorKind([
          makeZone({ questions: [makeQuestion({ autoPoints: 0, manualPoints: 0 })] }),
        ]),
      ).toBeUndefined();
    });

    it('returns questionPoints when an alternative has no points and pool has no points', () => {
      expect(
        getStructuralSaveValidationErrorKind([
          makeZone({
            questions: [
              makeQuestion({
                id: undefined,
                alternatives: [makeAlternative()],
              }),
            ],
          }),
        ]),
      ).toBe('questionPoints');
    });

    it('returns undefined when alternative inherits points from pool', () => {
      expect(
        getStructuralSaveValidationErrorKind([
          makeZone({
            questions: [
              makeQuestion({
                id: undefined,
                autoPoints: 10,
                alternatives: [makeAlternative()],
              }),
            ],
          }),
        ]),
      ).toBeUndefined();
    });

    it('returns undefined when alternative has its own points', () => {
      expect(
        getStructuralSaveValidationErrorKind([
          makeZone({
            questions: [
              makeQuestion({
                id: undefined,
                alternatives: [makeAlternative({ autoPoints: 5 })],
              }),
            ],
          }),
        ]),
      ).toBeUndefined();
    });

    it('returns questionPoints when one alternative in pool has no points', () => {
      expect(
        getStructuralSaveValidationErrorKind([
          makeZone({
            questions: [
              makeQuestion({
                id: undefined,
                alternatives: [
                  makeAlternative({ autoPoints: 5 }),
                  makeAlternative({
                    trackingId: makeTrackingId(201),
                    id: 'alt2',
                  }),
                ],
              }),
            ],
          }),
        ]),
      ).toBe('questionPoints');
    });
  });
});
