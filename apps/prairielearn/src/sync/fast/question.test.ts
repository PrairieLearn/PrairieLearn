import path from 'node:path';

import { v4 as uuidv4 } from 'uuid';
import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { selectCourseById } from '../../models/course.js';
import { selectQuestionByQid } from '../../models/question.js';
import { selectTagsByQuestionId } from '../../models/tags.js';
import type { QuestionJsonInput } from '../../schemas/index.js';
import * as helperDb from '../../tests/helperDb.js';
import * as util from '../../tests/sync/util.js';

import { qidFromFilePath } from './question.js';

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

describe('qidFromFilePath', () => {
  it('should extract QID from simple question path', () => {
    const result = qidFromFilePath('questions/foo/info.json');
    assert.equal(result, 'foo');
  });

  it('should extract QID from nested question path', () => {
    const result = qidFromFilePath('questions/foo/bar/info.json');
    assert.equal(result, 'foo/bar');
  });

  it('should extract QID from deeply nested question path', () => {
    const result = qidFromFilePath('questions/topic1/subtopic/my-question/info.json');
    assert.equal(result, 'topic1/subtopic/my-question');
  });
});

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

      const question = await selectQuestionByQid({ course_id: course.id, qid });
      assert.equal(question.title, courseData.questions[qid].title);
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

      const question = await selectQuestionByQid({ course_id: course.id, qid });
      assert.equal(question.title, courseData.questions[qid].title);
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

      const question = await selectQuestionByQid({ course_id: course.id, qid });
      assert.equal(question.title, courseData.questions[qid].title);
    },
  );

  it('syncs existing question tags with fast sync', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

    // Validate assumptions about test data.
    assert.deepEqual(courseData.questions[util.QUESTION_ID].tags, ['test']);

    courseData.questions[util.QUESTION_ID].tags = ['another test'];
    await util.writeCourseToDirectory(courseData, courseDir);

    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy([path.join('questions', util.QUESTION_ID, 'info.json')]);
    assert(strategy !== null);
    assert.isTrue(await attemptFastSync(course, strategy));

    const question = await selectQuestionByQid({ course_id: course.id, qid: util.QUESTION_ID });
    const tags = await selectTagsForQuestion({ question_id: question.id });
    assert.lengthOf(tags, 1);
    assert.isTrue(tags.some((tag) => tag.name === 'another test'));
  });

  it('syncs new question tags with fast sync', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

    const questionData = makeQuestion(courseData);
    questionData.tags = ['test'];
    courseData.questions['test-question'] = questionData;
    await util.writeCourseToDirectory(courseData, courseDir);

    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy([path.join('questions', util.QUESTION_ID, 'info.json')]);
    assert(strategy !== null);
    assert.isTrue(await attemptFastSync(course, strategy));

    const question = await selectQuestionByQid({ course_id: course.id, qid: util.QUESTION_ID });
    const tags = await selectTagsByQuestionId(question.id);
    assert.lengthOf(tags, 1);
    assert.isTrue(tags.some((tag) => tag.name === 'test'));
  });

  it('falls back to slow sync when tags do not exist', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

    courseData.questions[util.QUESTION_ID].tags = ['nonexistent tag'];
    await util.writeCourseToDirectory(courseData, courseDir);

    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy([path.join('questions', util.QUESTION_ID, 'info.json')]);
    assert(strategy !== null);
    assert.isFalse(await attemptFastSync(course, strategy));
  });

  it('syncs errors to question with fast sync', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

    // @ts-expect-error -- Deliberately introducing malformed JSON.
    courseData.questions[util.QUESTION_ID].title = undefined;
    await util.writeCourseToDirectory(courseData, courseDir);

    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy([path.join('questions', util.QUESTION_ID, 'info.json')]);
    assert(strategy !== null);
    assert.isTrue(await attemptFastSync(course, strategy));

    const question = await selectQuestionByQid({ course_id: course.id, qid: util.QUESTION_ID });
    assert.match(question.sync_errors ?? '', /must have required property 'title'/);
  });

  it('syncs warnings to question with fast sync', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

    courseData.questions[util.QUESTION_ID].externalGradingOptions = {
      image: 'alpine',
      // This exceeds the maximum timeout, which will produce a warning.
      timeout: 1000,
    };
    await util.writeCourseToDirectory(courseData, courseDir);

    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy([path.join('questions', util.QUESTION_ID, 'info.json')]);
    assert(strategy !== null);
    assert.isTrue(await attemptFastSync(course, strategy));

    const question = await selectQuestionByQid({ course_id: course.id, qid: util.QUESTION_ID });
    assert.match(question.sync_warnings ?? '', /exceeds the maximum value and has been limited/);
  });

  it('syncs non-JSON changes to question with fast sync', async () => {
    const { syncResults } = await util.createAndSyncCourseData();

    // TODO: in theory this can skip writing anything to the database at all.
    // Can we implement that and write a test for it?
    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy([
      path.join('questions', util.QUESTION_ID, 'server.py'),
      path.join('questions', util.QUESTION_ID, 'question.html'),
    ]);
    assert(strategy !== null);
    assert.isTrue(await attemptFastSync(course, strategy));
  });

  it.for([{ qid: 'test-question' }, { qid: 'nested/test-question' }])(
    'falls back to slow sync for deletion of question $qid',
    async ({ qid }) => {
      const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

      courseData.questions[qid] = makeQuestion(courseData);
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      delete courseData.questions[qid];
      await util.writeCourseToDirectory(courseData, courseDir);

      const course = await selectCourseById(syncResults.courseId);
      const strategy = getFastSyncStrategy([path.join('questions', qid, 'info.json')]);
      assert(strategy !== null);
      assert.isFalse(await attemptFastSync(course, strategy));
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

  it('falls back to slow sync when topic does not exist', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

    // Change the topic to something that doesn't exist.
    courseData.questions[util.QUESTION_ID].topic = 'nonexistent-topic';
    await util.writeCourseToDirectory(courseData, courseDir);

    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy([path.join('questions', util.QUESTION_ID, 'info.json')]);
    assert(strategy !== null);
    assert.isFalse(await attemptFastSync(course, strategy));
  });

  it('falls back to slow sync when changing to Manual grading method', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

    // Change the grading method to Manual.
    courseData.questions[util.QUESTION_ID].gradingMethod = 'Manual';
    await util.writeCourseToDirectory(courseData, courseDir);

    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy([path.join('questions', util.QUESTION_ID, 'info.json')]);
    assert(strategy !== null);
    assert.isFalse(await attemptFastSync(course, strategy));
  });

  it('falls back to slow sync when changing from Manual grading method', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

    // Change the grading method to Internal.
    courseData.questions[util.MANUAL_GRADING_QUESTION_ID].gradingMethod = 'Internal';
    await util.writeCourseToDirectory(courseData, courseDir);

    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy([
      path.join('questions', util.MANUAL_GRADING_QUESTION_ID, 'info.json'),
    ]);
    assert(strategy !== null);
    assert.isFalse(await attemptFastSync(course, strategy));
  });
});
