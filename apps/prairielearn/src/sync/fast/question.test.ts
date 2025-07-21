import path from 'node:path';

import { v4 as uuidv4 } from 'uuid';
import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { selectCourseById } from '../../models/course.js';
import type { QuestionJsonInput } from '../../schemas/index.js';
import * as helperDb from '../../tests/helperDb.js';
import * as util from '../../tests/sync/util.js';

import { attemptFastSync, getFastSyncStrategy } from './index.js';

/**
 * Makes an empty question.
 */
function makeQuestion(courseData: util.CourseData): QuestionJsonInput {
  return {
    uuid: uuidv4(),
    title: 'Test question',
    type: 'v3',
    topic: courseData.course.topics[0].name,
  };
}

describe('fastSyncQuestion', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(helperDb.resetDatabase);

  it.for([{ qid: 'test-question' }, { qid: 'nested/test-question' }])(
    'syncs newly-created question $qid with fast sync',
    async ({ qid }) => {
      const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

      courseData.questions[qid] = makeQuestion(courseData);
      await util.writeCourseToDirectory(courseData, courseDir);

      const course = await selectCourseById(syncResults.courseId);
      const strategy = getFastSyncStrategy([path.join('questions', qid, 'info.json')]);
      assert(strategy !== null);
      assert.isTrue(await attemptFastSync(course, strategy));
    },
  );

  it.for([{ qid: 'test-question' }, { qid: 'nested/test-question' }])(
    'syncs newly-created question $qid with extra files with fast sync',
    async ({ qid }) => {
      const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

      courseData.questions[qid] = makeQuestion(courseData);
      await util.writeCourseToDirectory(courseData, courseDir);

      const course = await selectCourseById(syncResults.courseId);
      const strategy = getFastSyncStrategy([
        path.join('questions', qid, 'info.json'),
        path.join('questions', qid, 'question.html'),
        path.join('questions', qid, 'server.py'),
      ]);
      assert(strategy !== null);
      assert.isTrue(await attemptFastSync(course, strategy));
    },
  );

  it.for([{ qid: 'test-question' }, { qid: 'nested/test-question' }])(
    'syncs updates to question $qid with fast sync',
    async ({ qid }) => {
      const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

      courseData.questions[qid] = makeQuestion(courseData);
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      courseData.questions[qid].title = 'Modified title';
      await util.writeCourseToDirectory(courseData, courseDir);

      const course = await selectCourseById(syncResults.courseId);
      const strategy = getFastSyncStrategy([path.join('questions', qid, 'info.json')]);
      assert(strategy !== null);
      assert.isTrue(await attemptFastSync(course, strategy));
    },
  );

  it('falls back to slow sync when question UUID changes', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

    courseData.questions[util.QUESTION_ID].uuid = uuidv4();
    await util.writeCourseToDirectory(courseData, courseDir);

    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy([path.join('questions', util.QUESTION_ID, 'info.json')]);
    assert(strategy !== null);
    assert.isFalse(await attemptFastSync(course, strategy));
  });
});
