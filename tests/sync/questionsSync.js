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
  // Uncomment whenever you change relevant sprocs or migrations
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

    // Subsequent syncs with the same data should succeed as well
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedTags = await util.dumpTable('tags');
    syncedTag = syncedTags.find(tag => tag.name === missingTagName);
    assert.isOk(syncedTag);

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

    // Subsequent syncs with the same data should succeed as well
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedTopics = await util.dumpTable('topics');
    syncedTopic = syncedTopics.find(topic => topic.name === missingTopicName);
    assert.isOk(syncedTopic);

    // When missing topics are no longer used in any questions, they should
    // be removed from the DB
    courseData.questions[util.QUESTION_ID].topic = originalTopicName;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedTopics = await util.dumpTable('topics');
    syncedTopic = syncedTopics.find(topic => topic.name === missingTopicName);
    assert.isUndefined(syncedTopic);
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
    const questions = syncedQuestions.filter(q => q.qid === util.QUESTION_ID);
    assert.equal(questions.length, 2);
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
    const syncedQuestion = syncedQuestions.find(q => q.qid === util.QUESTION_ID);
    assert.match(syncedQuestion.sync_errors, /data should have required property 'incorrectAnswers'/);
  });

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
