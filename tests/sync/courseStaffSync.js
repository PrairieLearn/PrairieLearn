
const chai = require('chai');
const util = require('./util');
const helperDb = require('../helperDb');

const { assert } = chai;

describe('Course staff syncing', () => {
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('downgrades enrollment to student when removed from course staff', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const originalUids = Object.keys(courseData.courseInstances['Fa19'].courseInstance.userRoles);
    courseData.courseInstances['Fa19'].courseInstance.userRoles = {};
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const users = await util.dumpTable('users');
    const syncedEnrollments = await util.dumpTable('enrollments');
    for (const uid of originalUids) {
      const user = users.find(u => u.uid === uid);
      const syncedEnrollment = syncedEnrollments.find(e => e.user_id === user.user_id);
      assert.equal(syncedEnrollment.role, 'Student');
    }
  });

  it('updates a user\'s role when it is changed', async () => {
    const courseData = util.getCourseData();
    const uid = 'testing@illinois.edu';
    courseData.courseInstances['Fa19'].courseInstance.userRoles[uid] = 'TA';
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    courseData.courseInstances['Fa19'].courseInstance.userRoles[uid] = 'Instructor';
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const users = await util.dumpTable('users');
    const user = users.find(u => u.uid === uid);
    const syncedEnrollments = await util.dumpTable('enrollments');
    const syncedEnrollment = syncedEnrollments.find(e => e.user_id === user.user_id);
    assert.equal(syncedEnrollment.role, 'Instructor');
  });
});
