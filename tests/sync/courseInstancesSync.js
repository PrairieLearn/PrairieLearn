const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const fs = require('fs-extra');
const path = require('path');
const util = require('./util');
const helperDb = require('../helperDb');

const { assert } = chai;

describe('Course instance syncing', () => {
  before('remove the template database', helperDb.dropTemplate);
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('soft-deletes and restores course instnaces', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const originalCourseInstance = courseData.courseInstances[util.COURSE_INSTANCE_ID];
    let syncedCourseInstances = await util.dumpTable('course_instances');
    const originalSyncedCourseInstance = syncedCourseInstances.find(ci => ci.short_name === util.COURSE_INSTANCE_ID);
    assert.isOk(originalSyncedCourseInstance);

    delete courseData.courseInstances[util.COURSE_INSTANCE_ID];
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedCourseInstances = await util.dumpTable('course_instances');
    const deletedSyncedCourseInstance = syncedCourseInstances.find(ci => ci.short_name === util.COURSE_INSTANCE_ID);
    assert.isOk(deletedSyncedCourseInstance);
    assert.isNotNull(deletedSyncedCourseInstance.deleted_at);
    let syncedCourseInstanceAccessRules = await util.dumpTable('course_instance_access_rules');
    const syncedRulesForCourse = syncedCourseInstanceAccessRules.filter(ciar => ciar.course_instance_id === originalSyncedCourseInstance.id);
    assert.lengthOf(syncedRulesForCourse, 0);

    courseData.courseInstances[util.COURSE_INSTANCE_ID] = originalCourseInstance;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedCourseInstances = await util.dumpTable('course_instances');
    const newSyncedCourseInstance = syncedCourseInstances.find(ci => ci.short_name === util.COURSE_INSTANCE_ID);
    assert.isOk(newSyncedCourseInstance);
    assert.isNull(newSyncedCourseInstance.deleted_at);
    assert.deepEqual(newSyncedCourseInstance, originalSyncedCourseInstance);
  });

  it('fails if same UUID is used in multiple course instances', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances['newinstance'] = courseData.courseInstances[util.COURSE_INSTANCE_ID];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await assert.isRejected(util.syncCourseData(courseDir), /used in multiple course instances/);
  });

  it('fails if a course instance directory is missing an infoCourseInstance.json file', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'courseInstances', 'badCourseInstance'));
    await assert.isRejected(util.syncCourseData(courseDir), /ENOENT/);
  });
});
