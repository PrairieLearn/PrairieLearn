// @ts-check
const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const fs = require('fs-extra');
const path = require('path');
const util = require('./util');
const helperDb = require('../helperDb');

const { assert } = chai;

describe('Question syncing', () => {
  // before('remove the template database', helperDb.dropTemplate);
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('soft-deletes and restores questions', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const oldSyncedQuestions = await util.dumpTable('questions');
    const oldSyncedQuestion = oldSyncedQuestions.find(q => q.qid === util.QUESTION_ID);

    const oldQuestion = courseData.questions[util.QUESTION_ID];
    delete courseData.questions[util.QUESTION_ID];
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const midSyncedQuestions = await util.dumpTable('questions');
    const midSyncedQuestion = midSyncedQuestions.find(q => q.qid === util.QUESTION_ID);
    assert.isOk(midSyncedQuestion);
    assert.isNotNull(midSyncedQuestion.deleted_at);

    courseData.questions[util.QUESTION_ID] = oldQuestion;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedQuestions = await util.dumpTable('questions');
    const newSyncedQuestion = newSyncedQuestions.find(q => q.qid === util.QUESTION_ID);
    assert.deepEqual(newSyncedQuestion, oldSyncedQuestion);
  });

  it('handles tags that are not present in infoCourse.json', async () => {
    // Missing tags should be created
    const courseData = util.getCourseData();
    const missingTagName = 'missing tag name';
    courseData.questions[util.QUESTION_ID].tags.push(missingTagName);
    const courseDir = await util.writeAndSyncCourseData(courseData);
    let syncedTags = await util.dumpTable('tags');
    let syncedTag = syncedTags.find(tag => tag.name === missingTagName);
    assert.isOk(syncedTag);
    assert(syncedTag.description && syncedTag.description.length > 0, 'tag should not have empty description');

    // When missing tags are no longer used in any questions, they should
    // be removed from the DB
    courseData.questions[util.QUESTION_ID].tags.pop();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedTags = await util.dumpTable('tags');
    syncedTag = syncedTags.find(tag => tag.name === missingTagName);
    assert.isUndefined(syncedTag);
  });

  it('handles topics that are not present in infoCourse.json', async () => {
    // Missing topics should be created
    const courseData = util.getCourseData();
    const missingTopicName = 'missing topic name';
    const originalTopicName = courseData.questions[util.QUESTION_ID].topic;
    courseData.questions[util.QUESTION_ID].topic = missingTopicName;
    const courseDir = await util.writeAndSyncCourseData(courseData);
    let syncedTopics = await util.dumpTable('topics');
    let syncedTopic = syncedTopics.find(topic => topic.name === missingTopicName);
    assert.isOk(syncedTopic);
    assert(syncedTopic.description && syncedTopic.description.length > 0, 'tag should not have empty description');

    // When missing topics are no longer used in any questions, they should
    // be removed from the DB
    courseData.questions[util.QUESTION_ID].topic = originalTopicName;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedTopics = await util.dumpTable('topics');
    syncedTopic = syncedTopics.find(tag => tag.name === missingTopicName);
    assert.isUndefined(syncedTopic);
  });

  it('allows the same UUID to be used in different courses', async () => {
    // We'll just sync the same course from two different directories.
    // Since courses are identified by directory, this will create two
    // separate courses.
    // TODO: we should actually assert that two independent copies of all data exist.
    // While developing, I found some cases where data wasn't correctly scoped to one course/course instance.
    const courseData = util.getCourseData();
    const firstDirectory = await util.writeCourseToTempDirectory(courseData);
    const secondDirectory = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(firstDirectory);
    await util.syncCourseData(secondDirectory);
    // No need for assertions - either sync succeeds, or it'll fail and throw
    // an error, thus failing the test.
  });

  // TODO: Incremental syncing is now broken after altering the UNIQUE
  // constraint on the uuid column; fix this or remove the feature.
  /*
  it('incrementally syncs a single question', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const newTitle = 'This is a new title';
    const newTopic = 'this is a new topic';
    const newTag = 'this is a new tag';
    const question = courseData.questions[util.QUESTION_ID];
    question.title = newTitle;
    question.topic = newTopic;
    question.tags.push(newTag);
    await util.writeCourseToDirectory(courseData, courseDir);
    const syncInfo = await syncFromDisk.syncSingleQuestion(courseDir, util.QUESTION_ID, util.getFakeLogger());
    assert.isFalse(syncInfo.fullSync);

    const syncedQuestions = await util.dumpTable('questions');
    const syncedQuestion = syncedQuestions.find(q => q.qid === util.QUESTION_ID);
    assert.equal(syncedQuestion.title, newTitle);

    // A new topic should have been created for this question
    const syncedTopics = await util.dumpTable('topics');
    const syncedTopic = syncedTopics.find(t => t.name === newTopic);
    assert.equal(syncedTopic.color, 'gray1');
    assert.equal(syncedQuestion.topic_id, syncedTopic.id);

    // A new tag should have been created for this question
    const syncedTags = await util.dumpTable('tags');
    const syncedTag = syncedTags.find(t => t.name === newTag);
    assert.equal(syncedTag.color, 'gray1');

    // A relationship should exist between the new tag and the question
    const syncedQuestionTags = await util.dumpTable('question_tags');
    const syncedQuestionTag = syncedQuestionTags.find(qt => qt.question_id === syncedQuestion.id && qt.tag_id === syncedTag.id);
    assert.isOk(syncedQuestionTag);
  });

  it('handles duplicate UUIDs during an incremental sync', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    courseData.questions[util.QUESTION_ID] = courseData.questions[util.ALTERNATIVE_QUESTION_ID];
    await util.writeCourseToDirectory(courseData, courseDir);
    await assert.isRejected(syncFromDisk.syncSingleQuestion(courseDir, util.QUESTION_ID, util.getFakeLogger()), /UUID.*is used in other questions/);
  });

  it('handles a rename with unchanged UUID during an incremental sync', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    courseData.questions['new_question'] = courseData.questions[util.QUESTION_ID];
    delete courseData.questions[util.QUESTION_ID];
    await util.writeCourseToDirectory(courseData, courseDir);
    await syncFromDisk.syncSingleQuestion(courseDir, 'new_question', util.getFakeLogger());

    const syncedQuestions = await util.dumpTable('questions');
    const syncedQuestion = syncedQuestions.find(q => q.qid === 'new_question');
    assert.isOk(syncedQuestion);
    const deletedQuestion = syncedQuestions.find(q => q.qid === util.QUESTION_ID);
    assert.isUndefined(deletedQuestion);
  });
  */

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
    const syncedQuestion = syncedQuestions.find(q => q.qid === util.QUESTION_ID);
    assert.match(syncedQuestion.sync_errors, /data should have required property 'incorrectAnswers'/);
  });

  // TODO: add this back in once we have new tags syncing code.
  // Do we even want to enforce this behavior? Or just add a warning?
  /*
  it('records an error if a question has duplicate tags', async () => {
    const courseData = util.getCourseData();
    courseData.questions[util.QUESTION_ID].tags.push(courseData.questions[util.QUESTION_ID].tags[0]);
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedQuestions = await util.dumpTable('questions');
    const syncedQuestion = syncedQuestions.find(q => q.qid === util.QUESTION_ID);
    assert.match(syncedQuestion.sync_errors, /data should have required property 'incorrectAnswers'/);
  });
  */

  it('records a warning if same UUID is used in multiple questions', async () => {
    const courseData = util.getCourseData();
    courseData.questions['test2'] = courseData.questions[util.QUESTION_ID];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedQuestions = await util.dumpTable('questions');
    const firstSyncedQuestion = syncedQuestions.find(q => q.qid === util.QUESTION_ID);
    assert.match(firstSyncedQuestion.sync_warnings, /UUID "f4ff2429-926e-4358-9e1f-d2f377e2036a" is used in other questions: test2/);
    const secondSyncedQuestion = syncedQuestions.find(q => q.qid === util.QUESTION_ID);
    assert.match(secondSyncedQuestion.sync_warnings, new RegExp(`UUID "f4ff2429-926e-4358-9e1f-d2f377e2036a" is used in other questions: ${util.QUESTION_ID}`));
  });

  it('records an error if a question directory is missing an info.json file', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'questions', 'badQuestion'));
    await util.syncCourseData(courseDir);
  });
});
