import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { getCourseQuestionAuthorshipReport } from '../lib/question-authorship-report.js';

import * as helperCourse from './helperCourse.js';
import * as helperDb from './helperDb.js';

const sql = loadSqlEquiv(import.meta.url);

describe('Question authorship report', () => {
  beforeAll(async () => {
    await helperDb.before();
    await helperCourse.syncCourse();
    await execute(sql.set_authors, { author_uid: 'author' });
    await execute(sql.insert_copies);
    await execute(sql.connect_copies);
  });
  afterAll(helperDb.after);

  it('deduplicates downstream courses and institutions through deleted links and cycles', async () => {
    const report = await getCourseQuestionAuthorshipReport('1');
    // Each question is represented as [QID, course count, institution count].
    assert.deepEqual(
      report.map(({ uid, questions }) => ({
        uid,
        questions: questions.map((q) => [
          q.qid,
          q.downstream_course_count,
          q.downstream_institution_count,
        ]),
      })),
      [
        {
          uid: 'author',
          questions: [
            ['addNumbers', 2, 1],
            ['addVectors', 0, 0],
          ],
        },
        { uid: 'external', questions: [['addNumbers', 2, 1]] },
      ],
    );
  });
});
