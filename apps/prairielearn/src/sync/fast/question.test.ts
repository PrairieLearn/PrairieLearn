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

  it('syncs newly-created question with fast sync', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

    courseData.questions['test-question'] = makeQuestion(courseData);
    await util.writeCourseToDirectory(courseData, courseDir);

    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy(['questions/test-question/info.json']);
    assert(strategy !== null);
    await attemptFastSync(course, strategy);
  });

  it('syncs newly-created nested question with fast sync', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

    courseData.questions['test-question'] = makeQuestion(courseData);
    await util.writeCourseToDirectory(courseData, courseDir);

    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy(['questions/test-question/info.json']);
    assert(strategy !== null);
    await attemptFastSync(course, strategy);
  });
});
