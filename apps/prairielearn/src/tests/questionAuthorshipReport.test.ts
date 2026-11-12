import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { getCourseQuestionAuthorshipReport } from '../lib/question-authorship-report.js';

import * as helperDb from './helperDb.js';

const sql = loadSqlEquiv(import.meta.url);

describe('Question authorship report', () => {
  beforeAll(async () => {
    await helperDb.before();
    await execute(sql.insert_institution);
    await execute(sql.insert_courses);
    await execute(sql.insert_questions);
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
            ['root', 2, 1],
            ['self', 0, 0],
          ],
        },
        { uid: 'external', questions: [['root', 2, 1]] },
      ],
    );
  });
});
