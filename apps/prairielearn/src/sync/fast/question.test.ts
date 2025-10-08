import fs from 'node:fs/promises';
import path from 'node:path';

import { v4 as uuidv4 } from 'uuid';
import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { AuthorSchema, QuestionAuthorSchema } from '../../lib/db-types.js';
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
    const tags = await selectTagsByQuestionId(question.id);
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

  it('adds and removes authors with fast sync', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

    // Add an author that we'll use to assert that we're not being too aggressive
    // in deleting authors. We won't test fast syncing with this question, we'll
    // just assert that it remains in the database at the end of the test.
    courseData.questions[util.ALTERNATIVE_QUESTION_ID].authors = [
      { name: 'Another Author', email: 'another.author@example.com' },
    ];
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    // Add an author.
    courseData.questions[util.QUESTION_ID].authors = [
      { name: 'New Author', email: 'new.author@example.com' },
    ];
    await util.writeCourseToDirectory(courseData, courseDir);

    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy([path.join('questions', util.QUESTION_ID, 'info.json')]);
    assert(strategy !== null);
    assert.isTrue(await attemptFastSync(course, strategy));

    const authors = await util.dumpTableWithSchema('authors', AuthorSchema);
    const author = authors.find((a) => a.email === 'new.author@example.com');
    assert.isDefined(author);
    assert.equal(author.author_name, 'New Author');

    const question = await selectQuestionByQid({ course_id: course.id, qid: util.QUESTION_ID });
    const allQuestionAuthors = await util.dumpTableWithSchema(
      'question_authors',
      QuestionAuthorSchema,
    );
    const questionAuthors = allQuestionAuthors.filter((qa) => qa.question_id === question.id);
    assert.lengthOf(questionAuthors, 1);
    assert.equal(questionAuthors[0].author_id, author.id);

    // Remove the author.
    courseData.questions[util.QUESTION_ID].authors = [];
    await util.writeCourseToDirectory(courseData, courseDir);

    const deleteStrategy = getFastSyncStrategy([
      path.join('questions', util.QUESTION_ID, 'info.json'),
    ]);
    assert(deleteStrategy !== null);
    assert.isTrue(await attemptFastSync(course, deleteStrategy));

    const allQuestionAuthorsAfterDelete = await util.dumpTableWithSchema(
      'question_authors',
      QuestionAuthorSchema,
    );
    const questionAuthorsAfterDelete = allQuestionAuthorsAfterDelete.filter(
      (qa) => qa.question_id === question.id,
    );
    assert.lengthOf(questionAuthorsAfterDelete, 0);

    // Sanity check: ensure that it didn't delete *every* question author.
    assert.isTrue(allQuestionAuthorsAfterDelete.length > 0);
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

  it.for([{ qid: 'test-question' }, { qid: 'nested/test-question' }])(
    'falls back to slow sync when $qid info.json is deleted but other files remain',
    async ({ qid }) => {
      const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

      courseData.questions[qid] = makeQuestion(courseData);
      await util.overwriteAndSyncCourseData(courseData, courseDir);

      await fs.writeFile(path.join(courseDir, 'questions', qid, 'question.html'), 'Testing!');
      await fs.rm(path.join(courseDir, 'questions', qid, 'info.json'));

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

  it('falls back to slow sync when question path changes', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

    // Move the question to a new path.
    const questionData = courseData.questions[util.QUESTION_ID];
    delete courseData.questions[util.QUESTION_ID];
    courseData.questions['new-location/test-question'] = questionData;
    await util.writeCourseToDirectory(courseData, courseDir);

    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy([
      path.join('questions', util.QUESTION_ID, 'info.json'),
      path.join('questions', 'new-location', 'test-question', 'info.json'),
    ]);
    assert(strategy !== null);
    assert.isFalse(await attemptFastSync(course, strategy));
  });

  it('falls back to slow sync when question is moved to a nested path', async () => {
    const { courseData, courseDir, syncResults } = await util.createAndSyncCourseData();

    const questionData = makeQuestion(courseData);
    courseData.questions['nested/test-question'] = questionData;
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    delete courseData.questions['nested/test-question'];
    courseData.questions['nested/test-question/nested-again'] = questionData;
    await util.writeCourseToDirectory(courseData, courseDir);

    const course = await selectCourseById(syncResults.courseId);
    const strategy = getFastSyncStrategy([
      path.join('questions', 'nested', 'test-question', 'info.json'),
      path.join('questions', 'nested', 'test-question', 'nested-again', 'info.json'),
    ]);
    assert(strategy !== null);
    assert.isFalse(await attemptFastSync(course, strategy));
  });
});
