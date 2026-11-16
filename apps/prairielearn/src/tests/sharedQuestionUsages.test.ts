import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { execute, loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { SharedQuestionUsageSchema } from '../lib/db-types.js';
import { insertSharedQuestionUsagesForSubmission } from '../models/shared-question-usages.js';

import * as helperDb from './helperDb.js';

const sql = loadSqlEquiv(import.meta.url);
const selectUsages = () => queryRows(sql.select_usages, SharedQuestionUsageSchema);

describe('Shared question usage', () => {
  beforeAll(async () => {
    await helperDb.before();
    await execute(sql.insert_fixture);
  });
  afterAll(helperDb.after);

  it('excludes same-course usage, deduplicates participants, and retains history', async () => {
    const record = (assessment_instance_id: string, course_id = '2') =>
      insertSharedQuestionUsagesForSubmission({
        question: { copied_from_question_id: '1' },
        course_id,
        assessment_instance_id,
      });
    await record('4', '1'); // The copy is referenced back in the source course.
    assert.isEmpty(await selectUsages());
    await record('1');
    await record('1');
    assert.lengthOf(await selectUsages(), 1);
    await record('2');
    await record('3'); // Excluded from statistics.
    const usages = await selectUsages();
    assert.deepEqual(
      usages.map((u) => [
        u.shared_question_id,
        u.destination_user_id,
        u.destination_course_id,
        u.destination_course_instance_id,
        u.destination_assessment_id,
      ]),
      [
        ['1', '1', '2', '1', '1'],
        ['1', '2', '2', '1', '1'],
      ],
    );
    await execute(sql.delete_history);
    assert.deepEqual(await selectUsages(), usages);
  });
});
