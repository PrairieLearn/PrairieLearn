const { assert } = require('chai');
const util = require('./util');
const helperDb = require('../helperDb');

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
});
