import path from 'node:path';

import fs from 'fs-extra';
import { describe, expect, test } from 'vitest';

import { EXAMPLE_COURSE_PATH } from '../../lib/paths.js';
import { AssessmentJsonSchema } from '../../schemas/index.js';

import { ZONE_INFO } from './components/CreateQuestionForm.js';
import { hasWireframePreview } from './components/WireframePreview.js';

const ASSESSMENT_PATH = path.join(
  EXAMPLE_COURSE_PATH,
  'courseInstances',
  'SectionA',
  'assessments',
  'questionTemplates',
  'infoAssessment.json',
);

/**
 * These tests ensure that the question creation page stays in sync with the
 * `questionTemplates` assessment in the example course. If you add, remove, or
 * rename a template question or zone, these tests will tell you which UI files
 * need to be updated.
 */
describe('Question template sync', () => {
  const assessment = AssessmentJsonSchema.parse(fs.readJsonSync(ASSESSMENT_PATH));
  const zones = assessment.zones;
  const allQids = zones.flatMap((z) => z.questions.flatMap((q) => (q.id ? [q.id] : [])));

  test('every zone title has a corresponding ZONE_INFO entry in CreateQuestionForm', () => {
    for (const zone of zones) {
      expect(ZONE_INFO, `Missing ZONE_INFO entry for zone "${zone.title}"`).toHaveProperty(
        zone.title!,
      );

      const info = ZONE_INFO[zone.title!];
      expect(info?.heading, `ZONE_INFO["${zone.title}"] is missing a heading`).toBeTruthy();
      expect(info?.description, `ZONE_INFO["${zone.title}"] is missing a description`).toBeTruthy();
    }
  });

  test('every ZONE_INFO entry corresponds to an assessment zone', () => {
    const zoneTitles = new Set(zones.map((z) => z.title));
    for (const title of Object.keys(ZONE_INFO)) {
      expect(
        zoneTitles,
        `ZONE_INFO has entry "${title}" but no matching zone in assessment`,
      ).toContain(title);
    }
  });

  test('every basic question (first zone) has a BASIC_QUESTION_MAP entry', () => {
    const basicZone = zones[0];
    for (const question of basicZone.questions) {
      expect(
        hasWireframePreview(question.id!),
        `Basic question "${question.id}" is missing a BASIC_QUESTION_MAP entry in WireframePreview.tsx`,
      ).toBe(true);
    }
  });

  test('no stale wireframe previews for questions not in the basic zone', () => {
    const basicQids = new Set(zones[0].questions.map((q) => q.id));

    const previewsOutsideBasic = allQids.filter(
      (qid) => !basicQids.has(qid) && hasWireframePreview(qid),
    );
    expect(
      previewsOutsideBasic,
      `Non-basic questions have wireframe previews (these should only be in the first zone): ${previewsOutsideBasic.join(', ')}`,
    ).toEqual([]);
  });

  test('every template question has a README.md', async () => {
    for (const qid of allQids) {
      const readmePath = path.join(EXAMPLE_COURSE_PATH, 'questions', qid, 'README.md');
      const exists = await fs.pathExists(readmePath);
      expect(exists, `README.md missing for "${qid}"`).toBe(true);
    }
  });
});
