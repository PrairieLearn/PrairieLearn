import { assert } from 'chai';
import * as fs from 'fs-extra';
import * as path from 'path';

import * as util from './util';
import * as helperDb from '../helperDb';
import { idsEqual } from '../../lib/id';

/**
 * Makes an empty question.
 */
function makeQuestion(courseData: util.CourseData): util.Question {
  return {
    uuid: '1e0724c3-47af-4ca3-9188-5227ef0c5549',
    title: 'Test question',
    type: 'v3',
    topic: courseData.course.topics[0].name,
  };
}

async function findSyncedQuestion(qid) {
  const syncedQuestions = await util.dumpTable('questions');
  return syncedQuestions.find((q) => q.qid === qid);
}

async function findSyncedUndeletedQuestion(qid) {
  const syncedQuestions = await util.dumpTable('questions');
  return syncedQuestions.find((q) => q.qid === qid && q.deleted_at == null);
}

describe('Question syncing', () => {
  before('set up testing database', helperDb.before);
  after('tear down testing database', helperDb.after);

  beforeEach('reset testing database', helperDb.resetDatabase);

  it('allows nesting of questions in subfolders', async () => {
    const courseData = util.getCourseData();
    const nestedQuestionStructure = ['subfolder1', 'subfolder2', 'subfolder3', 'nestedQuestion'];
    const questionId = nestedQuestionStructure.join('/');
    courseData.questions[questionId] = makeQuestion(courseData);
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedQuestions = await util.dumpTable('questions');
    const syncedQuestion = syncedQuestions.find((q) => q.qid === questionId);
    assert.isOk(syncedQuestion);
  });

  it('soft-deletes and restores questions', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const oldSyncedQuestions = await util.dumpTable('questions');
    const oldSyncedQuestion = oldSyncedQuestions.find((q) => q.qid === util.QUESTION_ID);

    const oldQuestion = courseData.questions[util.QUESTION_ID];
    delete courseData.questions[util.QUESTION_ID];
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const midSyncedQuestions = await util.dumpTable('questions');
    const midSyncedQuestion = midSyncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.isOk(midSyncedQuestion);
    assert.isNotNull(midSyncedQuestion?.deleted_at);

    courseData.questions[util.QUESTION_ID] = oldQuestion;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedQuestions = await util.dumpTable('questions');
    const newSyncedQuestion = newSyncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.deepEqual(newSyncedQuestion, oldSyncedQuestion);
  });

  it('handles tags that are not present in infoCourse.json', async () => {
    // Missing tags should be created
    const courseData = util.getCourseData();
    const missingTagName = 'missing tag name';
    courseData.questions[util.QUESTION_ID].tags?.push(missingTagName);
    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    let syncedTags = await util.dumpTable('tags');
    let syncedTag = syncedTags.find((tag) => tag.name === missingTagName);
    assert.isOk(syncedTag);
    assert.isNotEmpty(syncedTag?.description, 'tag should not have empty description');

    // Subsequent syncs with the same data should succeed as well
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedTags = await util.dumpTable('tags');
    syncedTag = syncedTags.find((tag) => tag.name === missingTagName);
    assert.isOk(syncedTag);

    // When missing tags are no longer used in any questions, they should
    // be removed from the DB
    courseData.questions[util.QUESTION_ID].tags?.pop();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedTags = await util.dumpTable('tags');
    syncedTag = syncedTags.find((tag) => tag.name === missingTagName);
    assert.isUndefined(syncedTag);
  });

  it('handles topics that are not present in infoCourse.json', async () => {
    // Missing topics should be created
    const courseData = util.getCourseData();
    const missingTopicName = 'missing topic name';
    const originalTopicName = courseData.questions[util.QUESTION_ID].topic;
    courseData.questions[util.QUESTION_ID].topic = missingTopicName;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);
    let syncedTopics = await util.dumpTable('topics');
    let syncedTopic = syncedTopics.find((topic) => topic.name === missingTopicName);
    assert.isOk(syncedTopic);
    assert.isNotEmpty(syncedTopic?.description, 'tag should not have empty description');

    // Subsequent syncs with the same data should succeed as well
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedTopics = await util.dumpTable('topics');
    syncedTopic = syncedTopics.find((topic) => topic.name === missingTopicName);
    assert.isOk(syncedTopic);

    // When missing topics are no longer used in any questions, they should
    // be removed from the DB
    courseData.questions[util.QUESTION_ID].topic = originalTopicName;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedTopics = await util.dumpTable('topics');
    syncedTopic = syncedTopics.find((topic) => topic.name === missingTopicName);
    assert.isUndefined(syncedTopic);
  });

  it('syncs empty arrays correctly', async () => {
    // Note that we want the database to contain empty arrays, not NULL
    const courseData = util.getCourseData();
    courseData.questions[util.QUESTION_ID].clientFiles = [];
    courseData.questions[util.QUESTION_ID].externalGradingOptions = {
      image: 'docker-image',
      entrypoint: 'entrypoint',
      serverFilesCourse: [],
    };
    await util.writeAndSyncCourseData(courseData);
    const syncedQuestions = await util.dumpTable('questions');
    const syncedQuestion = syncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.isArray(syncedQuestion?.client_files, 'client_files should be an array');
    assert.isEmpty(syncedQuestion?.client_files, 'client_files should be empty');
    assert.isArray(
      syncedQuestion?.external_grading_files,
      'external_grading_files should be an array',
    );
    assert.isEmpty(
      syncedQuestion?.external_grading_files,
      'external_grading_files should be empty',
    );
  });

  it('allows the same UUID to be used in different courses', async () => {
    // We'll just sync the same course from two different directories.
    // Since courses are identified by directory, this will create two
    // separate courses.
    const courseData = util.getCourseData();
    const firstDirectory = await util.writeCourseToTempDirectory(courseData);
    const secondDirectory = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(firstDirectory);
    await util.syncCourseData(secondDirectory);
    const syncedQuestions = await util.dumpTable('questions');
    const questions = syncedQuestions.filter((q) => q.qid === util.QUESTION_ID);
    assert.equal(questions.length, 2);
  });

  it('preserves question topic even if question topic is deleted', async () => {
    const courseData = util.getCourseData();
    const newTopic = {
      name: 'test topic',
      color: 'green1',
      description: 'test topic description',
    };
    courseData.course.topics.push(newTopic);
    courseData.questions[util.QUESTION_ID].topic = newTopic.name;
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const originalSyncedQuestion = await findSyncedQuestion(util.QUESTION_ID);

    // Now delete the topic, but leave the question in place.
    courseData.course.topics.pop();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedQuestion = await findSyncedQuestion(util.QUESTION_ID);
    assert.equal(newSyncedQuestion?.id, originalSyncedQuestion?.id);

    // Check that we have a valid auto-created topic
    const syncedTopics = await util.dumpTable('topics');
    const syncedTopic = syncedTopics.find((t) => t.name === newTopic.name);
    assert.equal(newSyncedQuestion?.topic_id, syncedTopic?.id);
  });

  it('preserves question tag even if question tag is deleted', async () => {
    const courseData = util.getCourseData();
    const newTag = {
      name: 'test tag',
      color: 'green1',
      description: 'test tag description',
    };
    courseData.course.tags.push(newTag);
    courseData.questions[util.QUESTION_ID].tags?.push(newTag.name);
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const originalSyncedQuestion = await findSyncedQuestion(util.QUESTION_ID);

    // Now delete the tag, but leave the question in place.
    courseData.course.tags.pop();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedQuestion = await findSyncedQuestion(util.QUESTION_ID);
    assert.equal(newSyncedQuestion?.id, originalSyncedQuestion?.id);

    // Check that we have a valid auto-created tag
    const syncedTags = await util.dumpTable('tags');
    const syncedTag = syncedTags.find((t) => t.name === newTag.name);
    const syncedQuestionTags = await util.dumpTable('question_tags');
    const syncedQuestionTag = syncedQuestionTags.find(
      (qt) => idsEqual(qt.question_id, newSyncedQuestion?.id) && idsEqual(qt.tag_id, syncedTag?.id),
    );
    assert.ok(syncedQuestionTag);
  });

  it('records an error if "options" object is invalid', async () => {
    const courseData = util.getCourseData();
    const testQuestion = courseData.questions[util.QUESTION_ID];
    testQuestion.type = 'Checkbox';
    // Bad options - missing `incorrectAnswers`
    testQuestion.options = {
      text: 'is this a bad question?',
      correctAnswers: ['yes'],
    };
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedQuestions = await util.dumpTable('questions');
    const syncedQuestion = syncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.match(
      syncedQuestion?.sync_errors,
      /data must have required property 'incorrectAnswers'/,
    );
  });

  it('records a warning if same UUID is used in multiple questions', async () => {
    const courseData = util.getCourseData();
    courseData.questions['test2'] = courseData.questions[util.QUESTION_ID];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedQuestions = await util.dumpTable('questions');
    const firstSyncedQuestion = syncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.match(
      firstSyncedQuestion?.sync_warnings,
      /UUID "f4ff2429-926e-4358-9e1f-d2f377e2036a" is used in other questions: test2/,
    );
    const secondSyncedQuestion = syncedQuestions.find((q) => q.qid === util.QUESTION_ID);
    assert.match(
      secondSyncedQuestion?.sync_warnings,
      new RegExp(
        `UUID "f4ff2429-926e-4358-9e1f-d2f377e2036a" is used in other questions: ${util.QUESTION_ID}`,
      ),
    );
  });

  it('records an error if a question directory is missing an info.json file', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'questions', 'badQuestion'));
    await util.syncCourseData(courseDir);

    const syncedQuestions = await util.dumpTable('questions');
    const syncedQuestion = syncedQuestions.find((q) => q.qid === 'badQuestion');
    assert.isOk(syncedQuestion);
    assert.match(
      syncedQuestion?.sync_errors,
      /Missing JSON file: questions\/badQuestion\/info.json/,
    );
  });

  it('records an error if a nested question directory does not eventually contain an info.json file', async () => {
    const courseData = util.getCourseData();
    const nestedQuestionStructure = ['subfolder1', 'subfolder2', 'subfolder3', 'nestedQuestion'];
    const questionId = nestedQuestionStructure.join('/');
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'questions', ...nestedQuestionStructure));
    await util.syncCourseData(courseDir);

    const syncedQuestions = await util.dumpTable('questions');
    const syncedQuestion = syncedQuestions.find((q) => q.qid === questionId);
    assert.isOk(syncedQuestion);
    assert.match(
      syncedQuestion?.sync_errors,
      /Missing JSON file: questions\/subfolder1\/subfolder2\/subfolder3\/nestedQuestion\/info.json/,
    );

    // We should only record an error for the most deeply nested directories,
    // not any of the intermediate ones.
    for (let i = 0; i < nestedQuestionStructure.length - 1; i++) {
      const partialNestedQuestionStructure = nestedQuestionStructure.slice(0, i);
      const partialQuestionId = partialNestedQuestionStructure.join('/');
      const syncedQuestion = syncedQuestions.find((q) => q.qid === partialQuestionId);
      assert.isUndefined(syncedQuestion);
    }
  });

  it('correctly handles a new question with the same QID as a deleted question', async () => {
    const courseData = util.getCourseData();
    const question = makeQuestion(courseData);
    courseData.questions['repeatedQuestion'] = question;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // now change the UUID of the question and re-sync
    question.uuid = '49c8b795-dfde-4c13-a040-0fd1ba711dc5';
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedQuestion = await findSyncedUndeletedQuestion('repeatedQuestion');
    assert.equal(syncedQuestion?.uuid, question.uuid);
  });

  it('does not modify deleted questions', async () => {
    const courseData = util.getCourseData();
    const originalQuestion = makeQuestion(courseData);
    courseData.questions['repeatedQuestion'] = originalQuestion;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // now change the UUID and title of the question and re-sync
    const newQuestion = { ...originalQuestion };
    newQuestion.uuid = '49c8b795-dfde-4c13-a040-0fd1ba711dc5';
    newQuestion.title = 'Changed title';
    courseData.questions['repeatedQuestion'] = newQuestion;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedQuestions = await util.dumpTable('questions');
    const deletedQuestion = syncedQuestions.find(
      (q) => q.qid === 'repeatedQuestion' && q.deleted_at != null,
    );
    assert.equal(deletedQuestion?.uuid, originalQuestion.uuid);
    assert.equal(deletedQuestion?.title, originalQuestion.title);
  });

  it('does not add errors to deleted questions', async () => {
    const courseData = util.getCourseData();
    const originalQuestion = makeQuestion(courseData);
    courseData.questions['repeatedQuestion'] = originalQuestion;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // now change the UUID of the question, add an error and re-sync
    const newQuestion = { ...originalQuestion };
    newQuestion.uuid = '49c8b795-dfde-4c13-a040-0fd1ba711dc5';
    // @ts-expect-error -- intentionally breaking the question
    delete newQuestion.title;
    courseData.questions['repeatedQuestion'] = newQuestion;
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    // check that the newly-synced question has an error
    const syncedQuestions = await util.dumpTable('questions');
    const syncedQuestion = syncedQuestions.find(
      (q) => q.qid === 'repeatedQuestion' && q.deleted_at == null,
    );
    assert.equal(syncedQuestion?.uuid, newQuestion.uuid);
    assert.match(syncedQuestion?.sync_errors, /must have required property 'title'/);

    // check that the old deleted question does not have any errors
    const deletedQuestion = syncedQuestions.find(
      (q) => q.qid === 'repeatedQuestion' && q.deleted_at != null,
    );
    assert.equal(deletedQuestion?.uuid, originalQuestion.uuid);
    assert.equal(deletedQuestion?.sync_errors, null);
  });

  // https://github.com/PrairieLearn/PrairieLearn/issues/6539
  it('handles unique sequence of renames and duplicate UUIDs', async () => {
    const courseData = util.getCourseData();

    // Start with a clean slate.
    courseData.questions = {};

    // Write and sync a single question.
    const originalQuestion = makeQuestion(courseData);
    originalQuestion.uuid = '0e8097aa-b554-4908-9eac-d46a78d6c249';
    courseData.questions['a'] = originalQuestion;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // Now "move" the above question to a new directory AND add another with the
    // same UUID.
    delete courseData.questions['a'];
    courseData.questions['b'] = originalQuestion;
    courseData.questions['c'] = originalQuestion;
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    // Now "fix" the duplicate UUID.
    courseData.questions['c'] = {
      ...originalQuestion,
      uuid: '0e3097ba-b554-4908-9eac-d46a78d6c249',
    };
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    const questions = await util.dumpTable('questions');

    // Original question should not exist.
    const originalQuestionRow = questions.find((q) => q.qid === 'a');
    assert.isUndefined(originalQuestionRow);

    // New questions should exist and have the correct UUIDs.
    const newQuestionRow1 = questions.find((q) => q.qid === 'b' && q.deleted_at === null);
    assert.isNull(newQuestionRow1?.deleted_at);
    assert.equal(newQuestionRow1?.uuid, '0e8097aa-b554-4908-9eac-d46a78d6c249');
    const newQuestionRow2 = questions.find((q) => q.qid === 'c' && q.deleted_at === null);
    assert.isNull(newQuestionRow2?.deleted_at);
    assert.equal(newQuestionRow2?.uuid, '0e3097ba-b554-4908-9eac-d46a78d6c249');
  });
});
