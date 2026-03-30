import { describe, expect, it } from 'vitest';

import type {
  SelectedItem,
  TrackingId,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../types.js';

import { sanitizeSelectedItem } from './selectedItem.js';

function tid(id: string): TrackingId {
  return id as unknown as TrackingId;
}

function makeQuestion(
  trackingId: string,
  overrides?: Partial<ZoneQuestionBlockForm>,
): ZoneQuestionBlockForm {
  return {
    trackingId: tid(trackingId),
    autoPoints: 1,
    ...overrides,
  } as ZoneQuestionBlockForm;
}

function makeZone(trackingId: string, questions: ZoneQuestionBlockForm[]): ZoneAssessmentForm {
  return {
    trackingId: tid(trackingId),
    lockpoint: false,
    canSubmit: [],
    canView: [],
    questions,
  } as ZoneAssessmentForm;
}

describe('sanitizeSelectedItem', () => {
  it('rewrites an alternative selection when the alternative moves to a different pool', () => {
    const zones = [
      makeZone('z1', [
        makeQuestion('pool-a', {
          alternatives: [{ trackingId: tid('alt-0'), id: 'q0' }],
        }),
        makeQuestion('pool-b', {
          alternatives: [{ trackingId: tid('alt-1'), id: 'q1' }],
        }),
      ]),
    ];

    const result = sanitizeSelectedItem(
      {
        type: 'alternative',
        questionTrackingId: 'pool-a',
        alternativeTrackingId: 'alt-1',
      },
      zones,
    );

    expect(result).toEqual({
      type: 'alternative',
      questionTrackingId: 'pool-b',
      alternativeTrackingId: 'alt-1',
    } satisfies SelectedItem);
  });

  it('downgrades an extracted alternative selection to a standalone question', () => {
    const zones = [makeZone('z1', [makeQuestion('alt-1', { id: 'q1' })])];

    const result = sanitizeSelectedItem(
      {
        type: 'alternative',
        questionTrackingId: 'pool-a',
        alternativeTrackingId: 'alt-1',
      },
      zones,
    );

    expect(result).toEqual({
      type: 'question',
      questionTrackingId: 'alt-1',
    } satisfies SelectedItem);
  });

  it('clears an alternative selection when the alternative is deleted', () => {
    const zones = [makeZone('z1', [])];

    expect(
      sanitizeSelectedItem(
        {
          type: 'alternative',
          questionTrackingId: 'pool-a',
          alternativeTrackingId: 'alt-1',
        },
        zones,
      ),
    ).toBeNull();
  });

  it('drops an invalid picker return selection instead of keeping a stale target', () => {
    const zones = [makeZone('z1', [])];

    expect(
      sanitizeSelectedItem(
        {
          type: 'picker',
          zoneTrackingId: 'z1',
          returnToSelection: {
            type: 'question',
            questionTrackingId: 'missing-question',
          },
        },
        zones,
      ),
    ).toEqual({
      type: 'picker',
      zoneTrackingId: 'z1',
    } satisfies SelectedItem);
  });
});
