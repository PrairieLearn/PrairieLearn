import * as path from 'path';

import fs from 'fs-extra';
import { assert, describe, expect, it, test } from 'vitest';

import { EXAMPLE_COURSE_PATH } from '../../../lib/paths.js';
import {
  type ZoneAssessmentJson,
  ZoneAssessmentJsonSchema,
} from '../../../schemas/infoAssessment.js';
import * as courseDB from '../../../sync/course-db.js';
import type { ZoneAssessmentForm } from '../types.js';

import {
  createAltPoolWithTrackingId,
  getDefaultPointFieldsForNewQuestion,
  prepareZonesForEditor,
  serializeZonesForJson,
  stripTrackingIds,
} from './dataTransform.js';

describe('serializeZonesForJson', () => {
  test('should strip defaults while preserving structure for all example course assessments', async () => {
    // Load course structure to find assessment file paths
    const courseData = await courseDB.loadFullCourse(null, EXAMPLE_COURSE_PATH);

    for (const [ciDir, courseInstanceData] of Object.entries(courseData.courseInstances)) {
      for (const [assessmentDir, assessmentInfo] of Object.entries(
        courseInstanceData.assessments,
      )) {
        if (!assessmentInfo.data) {
          continue;
        }

        // Read the raw JSON file directly (without Zod schema defaults applied)
        const assessmentPath = path.join(
          EXAMPLE_COURSE_PATH,
          'courseInstances',
          ciDir,
          'assessments',
          assessmentDir,
          'infoAssessment.json',
        );
        const rawContent = await fs.readFile(assessmentPath, 'utf8');
        const rawAssessment = JSON.parse(rawContent);
        const originalZones = rawAssessment.zones ?? [];

        // Parse zones through schema (this adds defaults like canSubmit: [])
        const parsedZones = originalZones.map((zone: unknown) =>
          ZoneAssessmentJsonSchema.parse(zone),
        );

        // serializeZonesForJson should strip defaults while preserving semantic meaning.
        // Verify that key properties are preserved and output is valid.
        const filteredZones = serializeZonesForJson(parsedZones);

        // The output should be parseable
        const reparsedFiltered = filteredZones.map((zone: unknown) =>
          ZoneAssessmentJsonSchema.parse(zone),
        );

        // Structure should be preserved
        assert.equal(reparsedFiltered.length, parsedZones.length, 'Zone count mismatch');
        for (let i = 0; i < parsedZones.length; i++) {
          assert.equal(
            reparsedFiltered[i].questions.length,
            parsedZones[i].questions.length,
            `Question count mismatch in zone ${i}`,
          );

          // Verify question IDs are preserved
          for (let j = 0; j < parsedZones[i].questions.length; j++) {
            const originalQ = parsedZones[i].questions[j];
            const filteredQ = reparsedFiltered[i].questions[j];

            if (originalQ.id) {
              assert.equal(filteredQ.id, originalQ.id, `Question ID mismatch at zone ${i}, q ${j}`);
            }

            // Verify alternatives are preserved for alternative pools
            if (originalQ.alternatives) {
              assert.ok(filteredQ.alternatives, `Missing alternatives at zone ${i}, q ${j}`);
              assert.equal(
                filteredQ.alternatives.length,
                originalQ.alternatives.length,
                `Alternative count mismatch at zone ${i}, q ${j}`,
              );
              for (let k = 0; k < originalQ.alternatives.length; k++) {
                assert.equal(
                  filteredQ.alternatives[k].id,
                  originalQ.alternatives[k].id,
                  `Alternative ID mismatch at zone ${i}, q ${j}, alt ${k}`,
                );
              }
            }
          }
        }
      }
    }
  });

  it('preserves explicit default allowRealTimeGrading on zones', () => {
    const parsedZones = [
      ZoneAssessmentJsonSchema.parse({
        title: 'Zone with default allowRealTimeGrading',
        allowRealTimeGrading: true,
        questions: [{ id: 'q1' }],
      }),
    ];

    // Explicit `true` must be preserved because a parent assessment may set
    // allowRealTimeGrading to `false`, and stripping the zone's `true` would
    // silently change its effective value via inheritance.
    const serialized = serializeZonesForJson(parsedZones);
    expect(serialized[0].allowRealTimeGrading).toBe(true);
  });

  it('preserves non-default allowRealTimeGrading on zones', () => {
    const parsedZones = [
      ZoneAssessmentJsonSchema.parse({
        title: 'Zone with non-default allowRealTimeGrading',
        allowRealTimeGrading: false,
        questions: [{ id: 'q1' }],
      }),
    ];

    const serialized = serializeZonesForJson(parsedZones);
    expect(serialized[0].allowRealTimeGrading).toBe(false);
  });

  it('preserves lockpoint when serializing zones', () => {
    const parsedZones = [
      ZoneAssessmentJsonSchema.parse({
        title: 'Lockpoint zone',
        lockpoint: true,
        questions: [{ id: 'q1' }],
      }),
    ];

    const serialized = serializeZonesForJson(parsedZones);
    assert.equal(serialized[0].lockpoint, true);

    const reparsed = serialized.map((zone) => ZoneAssessmentJsonSchema.parse(zone));
    assert.equal(reparsed[0].lockpoint, true);
  });
});

describe('prepareZonesForEditor', () => {
  it('adds trackingIds to zones, questions, and alternatives', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        title: 'Zone 1',
        lockpoint: false,
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

    const result = prepareZonesForEditor(zones, {});

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
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [
          { id: 'q1', canSubmit: [], canView: [] },
          { id: 'q2', canSubmit: [], canView: [] },
        ],
      },
    ];

    const result = prepareZonesForEditor(zones, {});

    const trackingIds = [
      result[0].trackingId,
      result[0].questions[0].trackingId,
      result[0].questions[1].trackingId,
    ];
    const uniqueIds = new Set(trackingIds);
    expect(uniqueIds.size).toBe(trackingIds.length);
  });
});

describe('new question defaults', () => {
  it('uses manual points for Manual questions', () => {
    expect(getDefaultPointFieldsForNewQuestion('Manual')).toEqual({
      autoPoints: undefined,
      manualPoints: 1,
    });
  });

  it('starts empty alt pools without inherited point defaults or numberChoose', () => {
    const result = createAltPoolWithTrackingId();

    expect(result.autoPoints).toBeUndefined();
    expect(result.manualPoints).toBeUndefined();
    expect(result.numberChoose).toBeUndefined();
    expect(result.alternatives).toEqual([]);
  });
});

describe('prepareZonesForEditor normalization', () => {
  it('normalizes legacy points/maxPoints to autoPoints/maxAutoPoints', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [
          { id: 'q1', points: 5, maxPoints: 10, canSubmit: [], canView: [] },
          {
            numberChoose: 1,
            canSubmit: [],
            canView: [],
            points: 3,
            alternatives: [{ id: 'alt1', points: 2, maxPoints: 8 }],
          },
        ],
      },
    ];

    const result = prepareZonesForEditor(zones, {});

    expect(result[0].questions[0].autoPoints).toBe(5);
    expect(result[0].questions[0].maxAutoPoints).toBe(10);
    expect(result[0].questions[0].points).toBeUndefined();
    expect(result[0].questions[0].maxPoints).toBeUndefined();

    expect(result[0].questions[1].autoPoints).toBe(3);
    expect(result[0].questions[1].points).toBeUndefined();

    expect(result[0].questions[1].alternatives![0].autoPoints).toBe(2);
    expect(result[0].questions[1].alternatives![0].maxAutoPoints).toBe(8);
    expect(result[0].questions[1].alternatives![0].points).toBeUndefined();
    expect(result[0].questions[1].alternatives![0].maxPoints).toBeUndefined();
  });

  it('does not normalize when autoPoints is already set', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [{ id: 'q1', autoPoints: 7, points: 5, canSubmit: [], canView: [] }],
      },
    ];

    const result = prepareZonesForEditor(zones, {});

    expect(result[0].questions[0].autoPoints).toBe(7);
    expect(result[0].questions[0].points).toBe(5);
  });

  it('normalizes points to autoPoints for Exam assessments', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [{ id: 'q1', points: 5, canSubmit: [], canView: [] }],
      },
    ];

    const result = prepareZonesForEditor(zones, {});

    expect(result[0].questions[0].autoPoints).toBe(5);
    expect(result[0].questions[0].points).toBeUndefined();
  });

  it('normalizes points to manualPoints for Manual grading questions', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [{ id: 'q1', points: 5, canSubmit: [], canView: [] }],
      },
    ];

    const metadata = {
      q1: { question: { grading_method: 'Manual' } },
    } as any;

    const result = prepareZonesForEditor(zones, metadata);

    expect(result[0].questions[0].manualPoints).toBe(5);
    expect(result[0].questions[0].points).toBeUndefined();
    expect(result[0].questions[0].autoPoints).toBeUndefined();
  });

  it('uses maxPoints as manualPoints for Manual questions with both points and maxPoints', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [{ id: 'q1', points: 2, maxPoints: 6, canSubmit: [], canView: [] }],
      },
    ];

    const metadata = {
      q1: { question: { grading_method: 'Manual' } },
    } as any;

    const result = prepareZonesForEditor(zones, metadata);

    expect(result[0].questions[0].manualPoints).toBe(6);
    expect(result[0].questions[0].points).toBeUndefined();
    expect(result[0].questions[0].maxPoints).toBeUndefined();
    expect(result[0].questions[0].autoPoints).toBeUndefined();
  });

  it('uses first element of points array as manualPoints for Manual questions', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [{ id: 'q1', points: [4, 3, 2], canSubmit: [], canView: [] }],
      },
    ];

    const metadata = {
      q1: { question: { grading_method: 'Manual' } },
    } as any;

    const result = prepareZonesForEditor(zones, metadata);

    expect(result[0].questions[0].manualPoints).toBe(4);
    expect(result[0].questions[0].points).toBeUndefined();
    expect(result[0].questions[0].autoPoints).toBeUndefined();
  });

  it('uses maxPoints as manualPoints for Manual questions with only maxPoints', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [{ id: 'q1', maxPoints: 6, canSubmit: [], canView: [] }],
      },
    ];

    const metadata = {
      q1: { question: { grading_method: 'Manual' } },
    } as any;

    const result = prepareZonesForEditor(zones, metadata);

    expect(result[0].questions[0].manualPoints).toBe(6);
    expect(result[0].questions[0].maxPoints).toBeUndefined();
    expect(result[0].questions[0].autoPoints).toBeUndefined();
  });

  it('skips Manual normalization when maxAutoPoints is already set', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [{ id: 'q1', points: 2, maxAutoPoints: 6, canSubmit: [], canView: [] }],
      },
    ];

    const metadata = {
      q1: { question: { grading_method: 'Manual' } },
    } as any;

    const result = prepareZonesForEditor(zones, metadata);

    // maxAutoPoints signals split-point mode; manualPoints was intentionally omitted
    expect(result[0].questions[0].manualPoints).toBeUndefined();
    expect(result[0].questions[0].autoPoints).toBe(2);
    expect(result[0].questions[0].maxAutoPoints).toBe(6);
    expect(result[0].questions[0].points).toBeUndefined();
  });

  it('skips Manual normalization when autoPoints is already set', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [{ id: 'q1', autoPoints: 3, canSubmit: [], canView: [] }],
      },
    ];

    const metadata = {
      q1: { question: { grading_method: 'Manual' } },
    } as any;

    const result = prepareZonesForEditor(zones, metadata);

    expect(result[0].questions[0].manualPoints).toBeUndefined();
    expect(result[0].questions[0].autoPoints).toBe(3);
  });

  it('does not overwrite existing manualPoints for Manual grading questions', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [{ id: 'q1', points: 5, manualPoints: 10, canSubmit: [], canView: [] }],
      },
    ];

    const metadata = {
      q1: { question: { grading_method: 'Manual' } },
    } as any;

    const result = prepareZonesForEditor(zones, metadata);

    expect(result[0].questions[0].manualPoints).toBe(10);
    expect(result[0].questions[0].autoPoints).toBe(5);
    expect(result[0].questions[0].points).toBeUndefined();
  });

  it('normalizes alt pool points to manualPoints when all alternatives are Manual', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [
          {
            numberChoose: 1,
            points: 10,
            canSubmit: [],
            canView: [],
            alternatives: [{ id: 'alt1' }, { id: 'alt2' }],
          },
        ],
      },
    ];

    const metadata = {
      alt1: { question: { grading_method: 'Manual' } },
      alt2: { question: { grading_method: 'Manual' } },
    } as any;

    const result = prepareZonesForEditor(zones, metadata);

    expect(result[0].questions[0].manualPoints).toBe(10);
    expect(result[0].questions[0].autoPoints).toBeUndefined();
    expect(result[0].questions[0].points).toBeUndefined();
  });

  it('normalizes alt pool points to autoPoints when all alternatives are auto-graded', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [
          {
            numberChoose: 1,
            points: 10,
            canSubmit: [],
            canView: [],
            alternatives: [{ id: 'alt1' }, { id: 'alt2' }],
          },
        ],
      },
    ];

    const metadata = {
      alt1: { question: { grading_method: 'External' } },
      alt2: { question: { grading_method: 'Internal' } },
    } as any;

    const result = prepareZonesForEditor(zones, metadata);

    expect(result[0].questions[0].autoPoints).toBe(10);
    expect(result[0].questions[0].manualPoints).toBeUndefined();
    expect(result[0].questions[0].points).toBeUndefined();
  });

  it('pushes alt pool points to alternatives when grading methods are mixed', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [
          {
            numberChoose: 1,
            points: 10,
            canSubmit: [],
            canView: [],
            alternatives: [{ id: 'alt1' }, { id: 'alt2' }],
          },
        ],
      },
    ];

    const metadata = {
      alt1: { question: { grading_method: 'Manual' } },
      alt2: { question: { grading_method: 'External' } },
    } as any;

    const result = prepareZonesForEditor(zones, metadata);
    const pool = result[0].questions[0];

    // Pool-level points should be cleared
    expect(pool.points).toBeUndefined();
    expect(pool.autoPoints).toBeUndefined();
    expect(pool.manualPoints).toBeUndefined();

    // Each alternative gets points based on its grading method
    expect(pool.alternatives![0].manualPoints).toBe(10);
    expect(pool.alternatives![0].autoPoints).toBeUndefined();
    expect(pool.alternatives![1].autoPoints).toBe(10);
    expect(pool.alternatives![1].manualPoints).toBeUndefined();

    // Info banner flag should be set for mixed alt pools
    expect(pool.pointsDistributedInfoBanner).toBe(true);
  });

  it('falls through to autoPoints when alt pool has no metadata', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [
          {
            numberChoose: 1,
            points: 10,
            canSubmit: [],
            canView: [],
            alternatives: [{ id: 'alt1' }, { id: 'alt2' }],
          },
        ],
      },
    ];

    const result = prepareZonesForEditor(zones, {});

    // No metadata → unknown grading methods → defaults to autoPoints
    expect(result[0].questions[0].autoPoints).toBe(10);
    expect(result[0].questions[0].points).toBeUndefined();
  });

  it('does not override alternative-level points when pushing pool points in mixed mode', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [
          {
            numberChoose: 1,
            points: 10,
            canSubmit: [],
            canView: [],
            alternatives: [{ id: 'alt1' }, { id: 'alt2', autoPoints: 7 }],
          },
        ],
      },
    ];

    const metadata = {
      alt1: { question: { grading_method: 'Manual' } },
      alt2: { question: { grading_method: 'External' } },
    } as any;

    const result = prepareZonesForEditor(zones, metadata);
    const pool = result[0].questions[0];

    // alt1 inherits pool points → manualPoints
    expect(pool.alternatives![0].manualPoints).toBe(10);
    // alt2 already has autoPoints, so pool points are NOT pushed
    expect(pool.alternatives![1].autoPoints).toBe(7);
  });

  it('preserves inherited maxPoints for legacy mixed-pool alternatives with their own points', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [
          {
            numberChoose: 1,
            maxPoints: 5,
            canSubmit: [],
            canView: [],
            alternatives: [
              { id: 'alt1', points: 2 },
              { id: 'alt2', points: 3 },
            ],
          },
        ],
      },
    ];

    const metadata = {
      alt1: { question: { grading_method: 'Manual' } },
      alt2: { question: { grading_method: 'External' } },
    } as any;

    const prepared = prepareZonesForEditor(zones, metadata);
    const saved = serializeZonesForJson(stripTrackingIds(prepared));

    // Both alternatives keep their own legacy `points`, but they also inherit
    // the pool's `maxPoints: 5`. Sync resolves that inherited max differently
    // by grading method: Manual uses it as `manualPoints`, while auto-graded
    // questions keep their own points and receive it as `maxAutoPoints`.
    expect(saved).toEqual([
      {
        questions: [
          {
            numberChoose: 1,
            alternatives: [
              { id: 'alt1', manualPoints: 5 },
              { id: 'alt2', autoPoints: 3, maxAutoPoints: 5 },
            ],
          },
        ],
      },
    ]);
  });

  it('normalizes alt pool maxPoints to manualPoints when all alternatives are Manual', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [
          {
            numberChoose: 1,
            maxPoints: 20,
            canSubmit: [],
            canView: [],
            alternatives: [{ id: 'alt1' }],
          },
        ],
      },
    ];

    const metadata = {
      alt1: { question: { grading_method: 'Manual' } },
    } as any;

    const result = prepareZonesForEditor(zones, metadata);

    expect(result[0].questions[0].manualPoints).toBe(20);
    expect(result[0].questions[0].maxPoints).toBeUndefined();
    expect(result[0].questions[0].autoPoints).toBeUndefined();
  });

  it('treats manual + unknown metadata as mixed to avoid dropping auto points', () => {
    const zones: ZoneAssessmentJson[] = [
      {
        lockpoint: false,
        canSubmit: [],
        canView: [],
        questions: [
          {
            numberChoose: 1,
            points: 10,
            canSubmit: [],
            canView: [],
            alternatives: [{ id: 'alt1' }, { id: 'alt2' }],
          },
        ],
      },
    ];

    // alt2 has no metadata (e.g. stale/deleted qid)
    const metadata = {
      alt1: { question: { grading_method: 'Manual' } },
    } as any;

    const result = prepareZonesForEditor(zones, metadata);
    const pool = result[0].questions[0];

    // Should be treated as mixed: points pushed to alternatives
    expect(pool.points).toBeUndefined();
    expect(pool.autoPoints).toBeUndefined();
    expect(pool.manualPoints).toBeUndefined();
    expect(pool.alternatives![0].manualPoints).toBe(10);
    expect(pool.alternatives![1].autoPoints).toBe(10);
  });
});

describe('serializeZonesForJson preferences', () => {
  it('preserves preferences on standalone questions', () => {
    const parsedZones = [
      ZoneAssessmentJsonSchema.parse({
        questions: [
          {
            id: 'q1',
            preferences: { gravitational_constant: 9.8, fired_object: 'cannon ball' },
          },
        ],
      }),
    ];

    const serialized = serializeZonesForJson(parsedZones);
    expect(serialized[0].questions[0].preferences).toEqual({
      gravitational_constant: 9.8,
      fired_object: 'cannon ball',
    });
  });

  it('preserves preferences on alternatives', () => {
    const parsedZones = [
      ZoneAssessmentJsonSchema.parse({
        questions: [
          {
            numberChoose: 1,
            alternatives: [
              { id: 'alt1', preferences: { mode: 'hard' } },
              { id: 'alt2', preferences: { mode: 'easy' } },
            ],
          },
        ],
      }),
    ];

    const serialized = serializeZonesForJson(parsedZones);
    const alts = serialized[0].questions[0].alternatives!;
    expect(alts[0].preferences).toEqual({ mode: 'hard' });
    expect(alts[1].preferences).toEqual({ mode: 'easy' });
  });

  it('does not include preferences key when not set', () => {
    const parsedZones = [
      ZoneAssessmentJsonSchema.parse({
        questions: [{ id: 'q1' }],
      }),
    ];

    const serialized = serializeZonesForJson(parsedZones);
    expect(serialized[0].questions[0]).not.toHaveProperty('preferences');
  });
});

describe('stripTrackingIds', () => {
  it('removes trackingIds from zones, questions, and alternatives', () => {
    const zones: ZoneAssessmentForm[] = [
      {
        trackingId: 'zone-tracking-id' as ZoneAssessmentForm['trackingId'],
        title: 'Zone 1',
        lockpoint: false,
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
        lockpoint: false,
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
