import * as path from 'path';

import fs from 'fs-extra';
import { assert, describe, test } from 'vitest';

import { EXAMPLE_COURSE_PATH } from '../../../lib/paths.js';
import { ZoneAssessmentJsonSchema } from '../../../schemas/infoAssessment.js';
import * as courseDB from '../../../sync/course-db.js';

import { serializeZonesForJson } from './dataTransform.js';

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
});
