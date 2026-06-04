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

import { addTrackingIds, serializeZonesForJson, stripTrackingIds } from './dataTransform.js';

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

            // Verify alternatives are preserved for alternative groups
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

describe('addTrackingIds', () => {
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
        lockpoint: false,
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
