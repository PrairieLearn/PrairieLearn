const util = require('./util');
const helperDb = require('../helperDb');

describe('Initial Sync', () => {
  before('set up testing database', helperDb.before);
  after('tear down testing database', helperDb.after);
  it('correctly syncs content from disk to the database', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToDisk(courseData);
    await util.syncCourseData(courseDir);
  });
});
