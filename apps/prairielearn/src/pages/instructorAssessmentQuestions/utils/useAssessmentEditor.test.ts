import { describe, expect, it } from 'vitest';

import type { ZoneAssessmentJson } from '../../../schemas/infoAssessment.js';
import type { ZoneAssessmentForm } from '../instructorAssessmentQuestions.shared.js';

import { addTrackingIds, stripTrackingIds } from './useAssessmentEditor.js';

describe('addTrackingIds', () => {
  it('adds trackingIds to zones, questions, and alternatives', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        title: 'Zone 1',
        canSubmit: [],
        canView: [],
        questions: [
          { id: 'q1', canSubmit: [], canView: [] },
          {
            numberChoose: 1,
            canSubmit: [],
            canView: [],
            alternatives: [{ id: 'alt1' }, { id: 'alt2' }],
          },
        ],
      },
    ];

    const result = addTrackingIds(zones);

    expect(result).toHaveLength(1);
    expect(result[0].trackingId).toBeDefined();
    expect(result[0].trackingId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result[0].questions[0].trackingId).toBeDefined();
    expect(result[0].questions[1].trackingId).toBeDefined();
    expect(result[0].questions[1].alternatives![0].trackingId).toBeDefined();
    expect(result[0].questions[1].alternatives![1].trackingId).toBeDefined();
  });

  it('generates unique trackingIds for each element', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        canSubmit: [],
        canView: [],
        questions: [
          { id: 'q1', canSubmit: [], canView: [] },
          { id: 'q2', canSubmit: [], canView: [] },
        ],
      },
    ];

    const result = addTrackingIds(zones);

    const trackingIds = [
      result[0].trackingId,
      result[0].questions[0].trackingId,
      result[0].questions[1].trackingId,
    ];
    const uniqueIds = new Set(trackingIds);
    expect(uniqueIds.size).toBe(trackingIds.length);
  });
});

describe('stripTrackingIds', () => {
  it('removes trackingIds from zones, questions, and alternatives', () => {
    const zones: ZoneAssessmentForm[] = [
      {
        trackingId: 'zone-tracking-id' as ZoneAssessmentForm['trackingId'],
        title: 'Zone 1',
        canSubmit: [],
        canView: [],
        questions: [
          {
            trackingId: 'q1-tracking-id' as ZoneAssessmentForm['questions'][0]['trackingId'],
            id: 'q1',
            canSubmit: [],
            canView: [],
          },
          {
            trackingId: 'q2-tracking-id' as ZoneAssessmentForm['questions'][0]['trackingId'],
            numberChoose: 1,
            canSubmit: [],
            canView: [],
            alternatives: [
              {
                trackingId: 'alt1-tracking-id' as ZoneAssessmentForm['questions'][0]['trackingId'],
                id: 'alt1',
              },
            ],
          },
        ],
      },
    ];

    const result = stripTrackingIds(zones);

    expect(result[0]).not.toHaveProperty('trackingId');
    expect(result[0].questions[0]).not.toHaveProperty('trackingId');
    expect(result[0].questions[1]).not.toHaveProperty('trackingId');
    expect(result[0].questions[1].alternatives![0]).not.toHaveProperty('trackingId');
  });

  it('preserves all other properties', () => {
    const zones: ZoneAssessmentForm[] = [
      {
        trackingId: 'zone-tracking-id' as ZoneAssessmentForm['trackingId'],
        title: 'My Zone',
        maxPoints: 100,
        canSubmit: [],
        canView: [],
        questions: [
          {
            trackingId: 'q1-tracking-id' as ZoneAssessmentForm['questions'][0]['trackingId'],
            id: 'question-1',
            points: 10,
            manualPoints: 5,
            canSubmit: [],
            canView: [],
          },
        ],
      },
    ];

    const result = stripTrackingIds(zones);

    expect(result[0].title).toBe('My Zone');
    expect(result[0].maxPoints).toBe(100);
    expect(result[0].questions[0].id).toBe('question-1');
    expect(result[0].questions[0].points).toBe(10);
    expect(result[0].questions[0].manualPoints).toBe(5);
  });
});
