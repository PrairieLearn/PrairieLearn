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
    expect(getStructuralSaveValidationErrorKind([makeZone()], 'Exam')).toBeUndefined();
  });

  it('returns zone when the first zone is a lockpoint', () => {
    expect(
      getStructuralSaveValidationErrorKind(
        [makeZone({ lockpoint: true }), makeZone({ trackingId: makeTrackingId(2) })],
        'Exam',
      ),
    ).toBe('zone');
  });

  describe('questionPoints', () => {
    it('returns questionPoints when a standalone question has no points', () => {
      expect(
        getStructuralSaveValidationErrorKind([makeZone({ questions: [makeQuestion()] })], 'Exam'),
      ).toBe('questionPoints');
    });

    it('returns undefined when a standalone question has autoPoints', () => {
      expect(
        getStructuralSaveValidationErrorKind(
          [makeZone({ questions: [makeQuestion({ autoPoints: 5 })] })],
          'Exam',
        ),
      ).toBeUndefined();
    });

    it('returns undefined when a standalone question has manualPoints', () => {
      expect(
        getStructuralSaveValidationErrorKind(
          [makeZone({ questions: [makeQuestion({ manualPoints: 5 })] })],
          'Exam',
        ),
      ).toBeUndefined();
    });

    it('returns undefined when a standalone question has points', () => {
      expect(
        getStructuralSaveValidationErrorKind(
          [makeZone({ questions: [makeQuestion({ points: 5 })] })],
          'Exam',
        ),
      ).toBeUndefined();
    });

    it('returns questionPoints when an alternative has no points and pool has no points', () => {
      expect(
        getStructuralSaveValidationErrorKind(
          [
            makeZone({
              questions: [
                makeQuestion({
                  id: undefined,
                  alternatives: [makeAlternative()],
                }),
              ],
            }),
          ],
          'Exam',
        ),
      ).toBe('questionPoints');
    });

    it('returns undefined when alternative inherits points from pool', () => {
      expect(
        getStructuralSaveValidationErrorKind(
          [
            makeZone({
              questions: [
                makeQuestion({
                  id: undefined,
                  autoPoints: 10,
                  alternatives: [makeAlternative()],
                }),
              ],
            }),
          ],
          'Exam',
        ),
      ).toBeUndefined();
    });

    it('returns undefined when alternative has its own points', () => {
      expect(
        getStructuralSaveValidationErrorKind(
          [
            makeZone({
              questions: [
                makeQuestion({
                  id: undefined,
                  alternatives: [makeAlternative({ autoPoints: 5 })],
                }),
              ],
            }),
          ],
          'Exam',
        ),
      ).toBeUndefined();
    });

    it('returns questionPoints when one alternative in pool has no points', () => {
      expect(
        getStructuralSaveValidationErrorKind(
          [
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
          ],
          'Exam',
        ),
      ).toBe('questionPoints');
    });
  });

  describe('homeworkRealTimeGrading', () => {
    it('returns homeworkRealTimeGrading when a zone disables it on Homework', () => {
      expect(
        getStructuralSaveValidationErrorKind(
          [makeZone({ allowRealTimeGrading: false })],
          'Homework',
        ),
      ).toBe('homeworkRealTimeGrading');
    });

    it('returns homeworkRealTimeGrading when a question disables it on Homework', () => {
      expect(
        getStructuralSaveValidationErrorKind(
          [
            makeZone({
              questions: [makeQuestion({ autoPoints: 10, allowRealTimeGrading: false })],
            }),
          ],
          'Homework',
        ),
      ).toBe('homeworkRealTimeGrading');
    });

    it('returns homeworkRealTimeGrading when an alternative disables it on Homework', () => {
      expect(
        getStructuralSaveValidationErrorKind(
          [
            makeZone({
              questions: [
                makeQuestion({
                  id: undefined,
                  autoPoints: 10,
                  alternatives: [makeAlternative({ allowRealTimeGrading: false })],
                }),
              ],
            }),
          ],
          'Homework',
        ),
      ).toBe('homeworkRealTimeGrading');
    });

    it('returns undefined when real-time grading is disabled on Exam', () => {
      expect(
        getStructuralSaveValidationErrorKind([makeZone({ allowRealTimeGrading: false })], 'Exam'),
      ).toBeUndefined();
    });

    it('returns undefined when allowRealTimeGrading is not explicitly false on Homework', () => {
      expect(getStructuralSaveValidationErrorKind([makeZone()], 'Homework')).toBeUndefined();
    });
  });
});
