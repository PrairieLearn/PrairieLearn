const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const fs = require('fs-extra');
const path = require('path');
const util = require('./util');
const helperDb = require('../helperDb');

const { assert } = chai;

describe('Question syncing', () => {
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('sof-deletes and restores questions', async () => {
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

  it('fails if same UUID is used in multiple questions', async () => {
    const courseData = util.getCourseData();
    courseData.questions['test2'] = courseData.questions['test'];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await assert.isRejected(util.syncCourseData(courseDir));
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

  it('fails if a question directory is missing an info.json file', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'questions', 'badQuestion'));
    await assert.isRejected(util.syncCourseData(courseDir), /ENOENT/);
  });
});
