const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const fs = require('fs-extra');
const path = require('path');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const util = require('./util');
const helperDb = require('../helperDb');

const sql = sqlLoader.loadSqlEquiv(__filename);
const { assert } = chai;

describe('Question syncing', () => {
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
    const courseData = util.getCourseData();
    const firstDirectory = await util.writeCourseToTempDirectory(courseData);
    const secondDirectory = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(firstDirectory);
    await util.syncCourseData(secondDirectory);
    // No need for assertions - either sync succeeds, or it'll fail and throw
    // an error, thus failing the test.
  });

  it('fails if a question has duplicate tags', async () => {
    const courseData = util.getCourseData();
    courseData.questions[util.QUESTION_ID].tags.push(courseData.questions[util.QUESTION_ID].tags[0]);
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await assert.isRejected(util.syncCourseData(courseDir), /duplicate tags/);
  });

  it('fails if same UUID is used in multiple questions', async () => {
    const courseData = util.getCourseData();
    courseData.questions['test2'] = courseData.questions[util.QUESTION_ID];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await assert.isRejected(util.syncCourseData(courseDir));
  });

  it('fails if workspaceOptions are not synced correctly', async () => {
    const courseData = util.getCourseData();
    const question = courseData.questions[util.WORKSPACE_QUESTION_ID];
    const workspaceImage = question.workspaceOptions.image;
    const workspacePort = question.workspaceOptions.port;
    const workspaceArgs = question.workspaceOptions.args;
    const quuid = question.uuid;

    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const result = await sqldb.queryOneRowAsync(sql.get_workspace_options, {quuid});
    const workspace_image = result.rows[0].workspace_image;
    const workspace_port = result.rows[0].workspace_port;
    const workspace_args = result.rows[0].workspace_args;

    await assert.equal(workspaceImage, workspace_image);
    await assert.equal(workspacePort, workspace_port);
    await assert.equal(workspaceArgs, workspace_args);
  });

  it('fails if a question directory is missing an info.json file', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'questions', 'badQuestion'));
    await assert.isRejected(util.syncCourseData(courseDir), /ENOENT/);
  });

  it('allows arbitrary nesting of questions in subfolders', async() => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    const nestedQuestionStructure = ['subfolder1', 'subfolder2', 'subfolder3', 'subfolder4', 'subfolder5', 'subfolder6', 'nestedQuestion'];
    const nestedQid = path.join(...nestedQuestionStructure);
    const questionPath = path.join(courseDir, 'questions', nestedQid);

    await fs.ensureDir(questionPath);
    await fs.copyFile(path.join(courseDir, 'questions', util.QUESTION_ID, 'info.json'), path.join(questionPath, 'info.json'));
    await fs.rmdir(path.join(courseDir, 'questions', util.QUESTION_ID), {'recursive': true});

    await util.syncCourseData(courseDir);
  });

  it('fails if a nested question directory does not eventually contain an info.json file', async() => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    const nestedQuestionStructure = ['subfolder1', 'subfolder2', 'subfolder3', 'subfolder4', 'subfolder5', 'subfolder6', 'badQuestion'];
    const nestedQid = path.join(...nestedQuestionStructure);
    const questionPath = path.join(courseDir, 'questions', nestedQid);

    await fs.ensureDir(questionPath);
    await assert.isRejected(util.syncCourseData(courseDir), /ENOENT/);
  });
});
