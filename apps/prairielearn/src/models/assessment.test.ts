import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { queryRow } from '@prairielearn/postgres';

import { AssessmentSchema } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';

import { selectAssessmentToolDefaults, selectZoneToolOverrides } from './assessment.js';

async function getAssessmentIdByTid(tid: string): Promise<string> {
  const row = await queryRow(
    `SELECT a.* FROM assessments AS a
     JOIN course_instances AS ci ON ci.id = a.course_instance_id
     WHERE a.tid = $1 AND ci.short_name = 'Sp15' AND a.deleted_at IS NULL`,
    [tid],
    AssessmentSchema,
  );
  return row.id;
}

describe('assessment model', () => {
  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse(TEST_COURSE_PATH);
  });
  afterAll(helperDb.after);

  describe('selectAssessmentToolDefaults', () => {
    it('returns assessment-level tool defaults', async () => {
      const assessmentId = await getAssessmentIdByTid('exam20-assessmentTools');
      const defaults = await selectAssessmentToolDefaults({ assessment_id: assessmentId });

      assert.isArray(defaults);
      assert.isAbove(defaults.length, 0);

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const calculator = defaults.find((t) => t.tool === 'calculator');
      assert.isNotNull(calculator);
      assert.equal(calculator?.enabled, true);
      assert.isNull(calculator?.zone_id);
    });

    it('returns empty array for assessment without tools', async () => {
      const assessmentId = await getAssessmentIdByTid('exam1-automaticTestSuite');
      const defaults = await selectAssessmentToolDefaults({ assessment_id: assessmentId });

      assert.isArray(defaults);
      assert.equal(defaults.length, 0);
    });
  });

  describe('selectZoneToolOverrides', () => {
    it('returns zone-level tool overrides', async () => {
      const assessmentId = await getAssessmentIdByTid('exam20-assessmentTools');
      const overrides = await selectZoneToolOverrides({ assessment_id: assessmentId });

      assert.isArray(overrides);
      assert.isAbove(overrides.length, 0);

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const calcOverride = overrides.find((o) => o.tool === 'calculator');
      assert.isNotNull(calcOverride);
      assert.equal(calcOverride?.enabled, false);
      assert.equal(calcOverride?.zone_number, 1);
    });

    it('returns empty array for assessment without zone tool overrides', async () => {
      const assessmentId = await getAssessmentIdByTid('exam1-automaticTestSuite');
      const overrides = await selectZoneToolOverrides({ assessment_id: assessmentId });

      assert.isArray(overrides);
      assert.equal(overrides.length, 0);
    });
  });
});
