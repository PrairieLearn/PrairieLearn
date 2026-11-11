import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';

import { execute, loadSqlEquiv, queryRow } from '@prairielearn/postgres';

import { ChunkSchema } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as helperCourse from '../tests/helperCourse.js';
import * as helperDb from '../tests/helperDb.js';

import { selectOptionalCourseByPath } from './course.js';
import {
  QuestionHistoryUnavailableError,
  selectOptionalQuestionVersionAtDate,
} from './question-version.js';
import { selectQuestionByQid } from './question.js';

const sql = loadSqlEquiv(import.meta.url);
const firstDate = '2030-01-01T00:00:00.000001Z';
const secondDate = '2030-01-01T00:00:00.000002Z';
const deletionDate = '2030-01-01T00:00:00.000003Z';

// Only database history is needed to exercise this reader; archives are not downloaded.
describe('question version lookup', () => {
  let question_id: string;

  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse();
    const course = await selectOptionalCourseByPath(TEST_COURSE_PATH);
    assert(course);
    question_id = (await selectQuestionByQid({ course_id: course.id, qid: 'addNumbers' })).id;
  });
  afterAll(helperDb.after);

  async function insertRevision({
    created_at,
    superseded_at = null,
    with_settings = true,
    partial_credit = true,
  }: {
    created_at: string | null;
    superseded_at?: string | null;
    with_settings?: boolean;
    partial_credit?: boolean;
  }) {
    return await queryRow(
      sql.insert_question_revision,
      { question_id, created_at, superseded_at, with_settings, partial_credit },
      ChunkSchema,
    );
  }

  it('selects matching files and settings at exact boundaries after rename and deletion', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const first = await insertRevision({ created_at: firstDate, superseded_at: secondDate });
      const second = await insertRevision({
        created_at: secondDate,
        superseded_at: deletionDate,
        partial_credit: false,
      });
      await execute(sql.rename_and_delete_question, { question_id });

      const original = await selectOptionalQuestionVersionAtDate({
        question_id,
        at_date: firstDate,
      });
      expect(original?.chunk).toEqual(first);
      expect(original?.question_version).toMatchObject({
        chunk_id: first.id,
        directory: 'addNumbers',
        partial_credit: true,
      });
      const replacement = await selectOptionalQuestionVersionAtDate({
        question_id,
        at_date: secondDate,
      });
      expect(replacement?.chunk).toEqual(second);
      expect(replacement?.question_version).toMatchObject({
        chunk_id: second.id,
        partial_credit: false,
      });
      expect(
        await selectOptionalQuestionVersionAtDate({
          question_id,
          at_date: '2030-01-01T00:00:00Z',
        }),
      ).toBeNull();
      expect(
        await selectOptionalQuestionVersionAtDate({
          question_id,
          at_date: deletionDate,
        }),
      ).toBeNull();
    });
  });

  it('rejects missing metadata instead of using an earlier snapshot or live settings', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      await insertRevision({ created_at: firstDate, superseded_at: secondDate });
      await insertRevision({ created_at: secondDate, with_settings: false });
      await expect(
        selectOptionalQuestionVersionAtDate({
          question_id,
          at_date: secondDate,
        }),
      ).rejects.toBeInstanceOf(QuestionHistoryUnavailableError);
    });
  });

  it('rejects undated baselines even when they have a settings snapshot', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      await insertRevision({ created_at: null });
      await expect(
        selectOptionalQuestionVersionAtDate({
          question_id,
          at_date: firstDate,
        }),
      ).rejects.toBeInstanceOf(QuestionHistoryUnavailableError);
    });
  });
});
