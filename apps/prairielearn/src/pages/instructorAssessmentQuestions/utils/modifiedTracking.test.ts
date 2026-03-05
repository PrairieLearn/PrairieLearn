import { describe, expect, it } from 'vitest';

import type { TrackingId, ZoneAssessmentForm } from '../types.js';

import { computeChangeTracking } from './modifiedTracking.js';

function tid(): TrackingId {
  return crypto.randomUUID() as TrackingId;
}

function makeZone(
  overrides: Partial<ZoneAssessmentForm> & { trackingId: TrackingId },
): ZoneAssessmentForm {
  return {
    questions: [],
    ...overrides,
  } as ZoneAssessmentForm;
}

type QuestionForm = ZoneAssessmentForm['questions'][number];
type AlternativeForm = NonNullable<QuestionForm['alternatives']>[number];

function makeQuestion(overrides: Partial<QuestionForm> & { trackingId: TrackingId }): QuestionForm {
  return {
    ...overrides,
  } as QuestionForm;
}

function makeAlternative(
  overrides: Partial<AlternativeForm> & { trackingId: TrackingId },
): AlternativeForm {
  return { ...overrides } as AlternativeForm;
}

describe('computeChangeTracking', () => {
  it('returns empty sets when nothing has changed', () => {
    const zoneId = tid();
    const questionId = tid();
    const zones: ZoneAssessmentForm[] = [
      makeZone({
        trackingId: zoneId,
        title: 'Zone 1',
        questions: [makeQuestion({ trackingId: questionId, id: 'q1' })],
      }),
    ];

    const { newIds, modifiedIds } = computeChangeTracking(zones, zones);

    expect(newIds.size).toBe(0);
    expect(modifiedIds.size).toBe(0);
  });

  it('detects new zones and new questions', () => {
    const initialZones: ZoneAssessmentForm[] = [];

    const newZoneId = tid();
    const newQuestionId = tid();
    const currentZones: ZoneAssessmentForm[] = [
      makeZone({
        trackingId: newZoneId,
        title: 'New Zone',
        questions: [makeQuestion({ trackingId: newQuestionId, id: 'q1' })],
      }),
    ];

    const { newIds, modifiedIds } = computeChangeTracking(initialZones, currentZones);

    expect(newIds).toContain(newZoneId);
    expect(newIds).toContain(newQuestionId);
    expect(modifiedIds.size).toBe(0);
  });

  it('detects modified zone props', () => {
    const zoneId = tid();
    const questionId = tid();
    const initialZones: ZoneAssessmentForm[] = [
      makeZone({
        trackingId: zoneId,
        title: 'Zone 1',
        questions: [makeQuestion({ trackingId: questionId, id: 'q1' })],
      }),
    ];
    const currentZones: ZoneAssessmentForm[] = [
      makeZone({
        trackingId: zoneId,
        title: 'Renamed Zone',
        questions: [makeQuestion({ trackingId: questionId, id: 'q1' })],
      }),
    ];

    const { newIds, modifiedIds } = computeChangeTracking(initialZones, currentZones);

    expect(newIds.size).toBe(0);
    expect(modifiedIds).toContain(zoneId);
    expect(modifiedIds).not.toContain(questionId);
  });

  it('treats false/undefined values as equivalent for propsKey', () => {
    const zoneId = tid();
    const questionId = tid();

    const initialZones: ZoneAssessmentForm[] = [
      makeZone({
        trackingId: zoneId,
        questions: [makeQuestion({ trackingId: questionId, id: 'q1', autoPoints: undefined })],
      }),
    ];
    const currentZones: ZoneAssessmentForm[] = [
      makeZone({
        trackingId: zoneId,
        questions: [makeQuestion({ trackingId: questionId, id: 'q1' })],
      }),
    ];

    const { newIds, modifiedIds } = computeChangeTracking(initialZones, currentZones);

    expect(newIds.size).toBe(0);
    expect(modifiedIds.size).toBe(0);
  });

  it('detects new alternatives', () => {
    const zoneId = tid();
    const questionId = tid();
    const altId = tid();

    const initialZones: ZoneAssessmentForm[] = [
      makeZone({
        trackingId: zoneId,
        questions: [makeQuestion({ trackingId: questionId, id: 'q1' })],
      }),
    ];
    const currentZones: ZoneAssessmentForm[] = [
      makeZone({
        trackingId: zoneId,
        questions: [
          makeQuestion({
            trackingId: questionId,
            id: 'q1',
            alternatives: [makeAlternative({ trackingId: altId, id: 'alt1' })],
          }),
        ],
      }),
    ];

    const { newIds } = computeChangeTracking(initialZones, currentZones);

    expect(newIds).toContain(altId);
  });

  it('does not mark items as modified when only reordered', () => {
    const zoneId = tid();
    const questionId = tid();
    const alt1Id = tid();
    const alt2Id = tid();

    const alt1 = makeAlternative({ trackingId: alt1Id, id: 'a1' });
    const alt2 = makeAlternative({ trackingId: alt2Id, id: 'a2' });

    const initialZones: ZoneAssessmentForm[] = [
      makeZone({
        trackingId: zoneId,
        questions: [
          makeQuestion({
            trackingId: questionId,
            alternatives: [alt1, alt2],
          }),
        ],
      }),
    ];
    const currentZones: ZoneAssessmentForm[] = [
      makeZone({
        trackingId: zoneId,
        questions: [
          makeQuestion({
            trackingId: questionId,
            alternatives: [alt2, alt1],
          }),
        ],
      }),
    ];

    const { newIds, modifiedIds } = computeChangeTracking(initialZones, currentZones);

    expect(newIds.size).toBe(0);
    expect(modifiedIds.size).toBe(0);
  });
});
