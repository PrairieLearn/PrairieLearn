// @ts-check
const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const fs = require('fs-extra');
const path = require('path');

const util = require('./util');
const helperDb = require('../helperDb');

const { assert } = chai;

/**
 * Makes an empty question.
 * 
 * @param {import('./util').CourseData} courseData
 * @returns {import('./util').Question}
 */
function makeQuestion(courseData) {
  return {
    uuid: '1e0724c3-47af-4ca3-9188-5227ef0c5549',
    title: 'Test question',
    type: 'v3',
    topic: courseData.course.topics[0].name,
  };
}

describe('Question syncing', () => {
  // Uncomment whenever you change relevant sprocs or migrations
  // before('remove the template database', helperDb.dropTemplate);
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('allows nesting of questions in subfolders', async() => {
    const courseData = util.getCourseData();
    const nestedQuestionStructure = ['subfolder1', 'subfolder2', 'subfolder3', 'nestedQuestion'];
    const questionId = nestedQuestionStructure.join('/');
    courseData.questions[questionId] = makeQuestion(courseData);
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedQuestions = await util.dumpTable('questions');
    const syncedQuestion = syncedQuestions.find(q => q.qid === questionId);
    assert.isOk(syncedQuestion);
  });

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
    const syncedQuestion = syncedQuestions.find(q => q.qid === util.QUESTION_ID);
    const { client_files, external_grading_files } = syncedQuestion;
    assert.isArray(client_files, 'client_files should be an array');
    assert.isEmpty(client_files, 'client_files should be empty');
    assert.isArray(external_grading_files, 'external_grading_files should be an array');
    assert.isEmpty(external_grading_files, 'external_grading_files should be empty');
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

    const syncedQuestions = await util.dumpTable('questions');
    const syncedQuestion = syncedQuestions.find(q => q.qid === 'badQuestion');
    assert.isOk(syncedQuestion);
    assert.match(syncedQuestion.sync_errors, /Missing JSON file: questions\/badQuestion\/info.json/);
  });

  it('records an error if a nested question directory does not eventually contain an info.json file', async() => {
    const courseData = util.getCourseData();
    const nestedQuestionStructure = ['subfolder1', 'subfolder2', 'subfolder3', 'nestedQuestion'];
    const questionId = nestedQuestionStructure.join('/');
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'questions', ...nestedQuestionStructure));
    await util.syncCourseData(courseDir);

    const syncedQuestions = await util.dumpTable('questions');
    const syncedQuestion = syncedQuestions.find(q => q.qid === questionId);
    assert.isOk(syncedQuestion);
    assert.match(syncedQuestion.sync_errors, /Missing JSON file: questions\/subfolder1\/subfolder2\/subfolder3\/nestedQuestion\/info.json/);

    // We should only record an error for the most deeply nested directories,
    // not any of the intermediate ones.
    for (let i = 0; i < nestedQuestionStructure.length - 1; i++) {
      const partialNestedQuestionStructure  = nestedQuestionStructure.slice(0, i);
      const partialQuestionId = partialNestedQuestionStructure.join('/');
      const syncedQuestion = syncedQuestions.find(q => q.qid === partialQuestionId);
      assert.isUndefined(syncedQuestion);
    }
  });
});
