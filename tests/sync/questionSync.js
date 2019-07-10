const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const util = require('./util');
const helperDb = require('../helperDb');

const { assert } = chai;

describe('Question syncing', () => {
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('soft-deletes questions that are removed from the course', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();

    delete courseData.questions['test'];
    await util.writeAndSyncCourseData(courseData, courseDir);

    const snapshot = await util.captureDatabaseSnapshot();
    const question = snapshot.questions.find(question => question.qid === 'test');
    assert.isOk(question);
    assert.isNotNull(question.deleted_at);
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
});
