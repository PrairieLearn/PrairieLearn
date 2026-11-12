import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { getCourseQuestionAuthorshipReport } from '../lib/question-authorship-report.js';
import { selectCourseById } from '../models/course.js';
import { selectQuestionCopyAdoption } from '../models/question.js';

import * as helperDb from './helperDb.js';

const sql = loadSqlEquiv(import.meta.url);

describe('Question authorship report', () => {
  beforeAll(async () => {
    await helperDb.before();
    await execute(sql.insert_institution);
    await execute(sql.insert_courses);
    await execute(sql.insert_questions);
    await execute(sql.insert_long_chain);
    await execute(sql.insert_paged_questions);
  });
  afterAll(helperDb.after);

  it('includes copies 20 links away but excludes the 21st link', async () => {
    assert.deepEqual(await selectQuestionCopyAdoption(['100']), [
      { question_id: '100', downstream_course_count: 1, downstream_institution_count: 1 },
    ]);
  });

  it('deduplicates downstream courses and institutions through deleted links and cycles', async () => {
    const course = await selectCourseById('1');
    const report = await getCourseQuestionAuthorshipReport(course);
    assert.deepEqual(
      report.authors.map(({ uid, question_count }) => [uid, question_count]),
      [
        ['author', 2],
        ['external', 1],
        ['paging-author', 51],
      ],
    );
    assert.deepEqual(
      report.questions.map((q) => [
        q.qid,
        q.downstream_course_count,
        q.downstream_institution_count,
      ]),
      [
        ['root', 2, 1],
        ['self', 0, 0],
      ],
    );
    const external = await getCourseQuestionAuthorshipReport(course, { authorUid: 'external' });
    assert.deepEqual(external.questions, [report.questions[0]]);
  });

  it('fetches only the selected author and page of questions', async () => {
    const course = await selectCourseById('1');
    const first = await getCourseQuestionAuthorshipReport(course, { authorUid: 'paging-author' });
    const last = await getCourseQuestionAuthorshipReport(course, {
      authorUid: 'paging-author',
      page: 2,
    });
    assert.lengthOf(first.questions, 50);
    assert.deepEqual(
      last.questions.map((q) => q.qid),
      ['page-051'],
    );
    assert.equal(last.author?.question_count, 51);
  });
});
