// @ts-check
const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const fs = require('fs-extra');
const path = require('path');
const util = require('./util');
const helperDb = require('../helperDb');

const { assert } = chai;

describe('Course instance syncing', () => {
  // before('remove the template database', helperDb.dropTemplate);
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('syncs access rules', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedAccessRules = await util.dumpTable('course_instance_access_rules');
    assert.equal(syncedAccessRules.length, courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess.length);
  });

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

    courseData.courseInstances[util.COURSE_INSTANCE_ID] = originalCourseInstance;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedCourseInstances = await util.dumpTable('course_instances');
    const newSyncedCourseInstance = syncedCourseInstances.find(ci => ci.short_name === util.COURSE_INSTANCE_ID);
    assert.isOk(newSyncedCourseInstance);
    assert.isNull(newSyncedCourseInstance.deleted_at);
    assert.deepEqual(newSyncedCourseInstance, originalSyncedCourseInstance);
  });

  it('gracefully handles a missing assessments directory', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.remove(path.join(courseDir, 'courseInstances', util.COURSE_INSTANCE_ID, 'assessments'));
    await util.syncCourseData(courseDir);
  });

  it('records a warning same UUID is used in multiple course instances', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances['newinstance'] = courseData.courseInstances[util.COURSE_INSTANCE_ID];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const firstCourseInstance = syncedCourseInstances.find(ci => ci.short_name === util.COURSE_INSTANCE_ID);
    assert.match(firstCourseInstance.sync_warnings, /UUID a17b1abd-eaf6-45dc-99bc-9890a7fb345e is used in other course instances: newinstance/);
    const secondCourseInstance = syncedCourseInstances.find(ci => ci.short_name === 'newinstance');
    assert.match(secondCourseInstance.sync_warnings, new RegExp(`UUID a17b1abd-eaf6-45dc-99bc-9890a7fb345e is used in other course instances: ${util.COURSE_INSTANCE_ID}`));
  });

  it('records an error if a course instance directory is missing an infoCourseInstance.json file', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'courseInstances', 'badCourseInstance', 'assessments'));
    await util.syncCourseData(courseDir);
  });
});
