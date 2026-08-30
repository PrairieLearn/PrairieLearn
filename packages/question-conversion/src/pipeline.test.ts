import { readFileSync } from 'node:fs';
import path from 'node:path';

import { assert, describe, expect, it } from 'vitest';

import { convert } from './pipeline.js';

const QTI12_FIXTURES = path.join(import.meta.dirname, 'test-fixtures/qti12');

describe('convert (integration)', () => {
  describe('QTI 1.2 assessment', () => {
    it('converts a multiple choice quiz end-to-end', async () => {
      const xml = readFileSync(path.join(QTI12_FIXTURES, 'canvas-mc.xml'), 'utf-8');
      const result = await convert(xml, { topic: 'Data Structures' });

      assert.equal(result.questions.length, 1);
      const q = result.questions[0];
      assert.equal(q.infoJson.type, 'v3');
      assert.equal(q.infoJson.title, 'Hashing Question');
      assert.equal(q.infoJson.topic, 'Data Structures');
      assert.deepEqual(q.infoJson.tags, ['imported', 'qti']);
      assert.isTrue(q.infoJson.singleVariant);
      assert.equal(q.directoryName, 'hashing');
    });

    it('propagates access_code from assessment_meta.xml into allowAccess password', async () => {
      const xml = readFileSync(path.join(QTI12_FIXTURES, 'canvas-mc.xml'), 'utf-8');
      const meta = `<?xml version="1.0" encoding="UTF-8"?>
<quiz xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <allowed_attempts>1</allowed_attempts>
  <access_code>hunter2</access_code>
</quiz>`;
      const result = await convert(xml, { assessmentMetaXml: meta });
      const rules = result.assessment.infoJson.allowAccess;
      assert.isDefined(rules);
      assert.isTrue(rules!.some((r) => r.password === 'hunter2'));
    });
  });

  describe('error handling', () => {
    it('throws for unrecognized format', async () => {
      await expect(convert('<html>not qti</html>')).rejects.toThrow(/No parser found/);
    });
  });

  describe('deterministic output', () => {
    it('produces identical UUIDs across runs', async () => {
      const xml = readFileSync(path.join(QTI12_FIXTURES, 'canvas-mc.xml'), 'utf-8');
      const [r1, r2] = await Promise.all([convert(xml), convert(xml)]);
      assert.equal(r1.questions[0].infoJson.uuid, r2.questions[0].infoJson.uuid);
    });
  });
});
