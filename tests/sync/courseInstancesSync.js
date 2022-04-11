// @ts-check
const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const fs = require('fs-extra');
const path = require('path');
const util = require('./util');
const helperDb = require('../helperDb');
const { idsEqual } = require('../../lib/id');

const { assert } = chai;

/**
 * Makes an empty course instance.
 *
 * @returns {import('./util').CourseInstanceData}
 */
function makeCourseInstance() {
  return {
    courseInstance: {
      uuid: '1e0724c3-47af-4ca3-9188-5227ef0c5549',
      longName: 'Test course instance',
    },
    assessments: {},
  };
}

describe('Course instance syncing', () => {
  // Uncomment whenever you change relevant sprocs or migrations
  // before('remove the template database', helperDb.dropTemplate);
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('allows nesting of course instances in subfolders', async () => {
    const courseData = util.getCourseData();
    const nestedCourseInstanceStructure = [
      'subfolder1',
      'subfolder2',
      'subfolder3',
      'nestedQuestion',
    ];
    const courseInstanceId = nestedCourseInstanceStructure.join('/');
    courseData.courseInstances[courseInstanceId] = makeCourseInstance();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === courseInstanceId
    );
    assert.isOk(syncedCourseInstance);
  });

  it('syncs access rules', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedAccessRules = await util.dumpTable('course_instance_access_rules');
    assert.equal(
      syncedAccessRules.length,
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess.length
    );
  });

  it('soft-deletes and restores course instances', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const originalCourseInstance = courseData.courseInstances[util.COURSE_INSTANCE_ID];
    let syncedCourseInstances = await util.dumpTable('course_instances');
    const originalSyncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID
    );
    assert.isOk(originalSyncedCourseInstance);

    delete courseData.courseInstances[util.COURSE_INSTANCE_ID];
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedCourseInstances = await util.dumpTable('course_instances');
    const deletedSyncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID
    );
    assert.isOk(deletedSyncedCourseInstance);
    assert.isNotNull(deletedSyncedCourseInstance.deleted_at);

    courseData.courseInstances[util.COURSE_INSTANCE_ID] = originalCourseInstance;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedCourseInstances = await util.dumpTable('course_instances');
    const newSyncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID
    );
    assert.isOk(newSyncedCourseInstance);
    assert.isNull(newSyncedCourseInstance.deleted_at);
    assert.deepEqual(newSyncedCourseInstance, originalSyncedCourseInstance);
  });

  it('gracefully handles a missing assessments directory', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.remove(
      path.join(courseDir, 'courseInstances', util.COURSE_INSTANCE_ID, 'assessments')
    );
    await util.syncCourseData(courseDir);
  });

  it('syncs empty arrays correctly', async () => {
    // Note that we want the database to contain empty arrays, not NULL
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess[0].uids = [];
    await util.writeAndSyncCourseData(courseData);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID
    );
    const syncedAccessRules = (await util.dumpTable('course_instance_access_rules')).filter((ar) =>
      idsEqual(ar.course_instance_id, syncedCourseInstance.id)
    );
    assert.lengthOf(syncedAccessRules, 1);
    const [syncedAccessRule] = syncedAccessRules;
    const { uids } = syncedAccessRule;
    assert.isArray(uids, 'uids should be an array');
    assert.isEmpty(uids, 'uids should be empty');
  });

  it('records a warning if the same UUID is used in multiple course instances', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances['newinstance'] = courseData.courseInstances[util.COURSE_INSTANCE_ID];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const firstCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID
    );
    assert.match(
      firstCourseInstance.sync_warnings,
      /UUID "a17b1abd-eaf6-45dc-99bc-9890a7fb345e" is used in other course instances: newinstance/
    );
    const secondCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === 'newinstance'
    );
    assert.match(
      secondCourseInstance.sync_warnings,
      new RegExp(
        `UUID "a17b1abd-eaf6-45dc-99bc-9890a7fb345e" is used in other course instances: ${util.COURSE_INSTANCE_ID}`
      )
    );
  });

  it('records an error if an allowAccess rule has a start date after the end date', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess.push({
      startDate: '2020-01-01T11:11:11',
      endDate: '2019-01-01T00:00:00',
    });
    await util.writeAndSyncCourseData(courseData);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID
    );
    assert.match(
      syncedCourseInstance.sync_errors,
      /Invalid allowAccess rule: startDate \(2020-01-01T11:11:11\) must not be after endDate \(2019-01-01T00:00:00\)/
    );
  });

  it('records an error if an allowAccess rule has an invalid start date', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess.push({
      startDate: 'not a valid date',
      endDate: '2019-01-01T00:00:00',
    });
    await util.writeAndSyncCourseData(courseData);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID
    );
    assert.match(
      syncedCourseInstance.sync_errors,
      /Invalid allowAccess rule: startDate \(not a valid date\) is not valid/
    );
  });

  it('records an error if an allowAccess rule has an invalid end date', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess.push({
      startDate: '2020-01-01T11:11:11',
      endDate: 'not a valid date',
    });
    await util.writeAndSyncCourseData(courseData);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID
    );
    assert.match(
      syncedCourseInstance.sync_errors,
      /Invalid allowAccess rule: endDate \(not a valid date\) is not valid/
    );
  });

  it('records an error if a course instance directory is missing an infoCourseInstance.json file', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'courseInstances', 'badCourseInstance'));
    await util.syncCourseData(courseDir);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === 'badCourseInstance'
    );
    assert.isOk(syncedCourseInstance);
    assert.match(
      syncedCourseInstance.sync_errors,
      /Missing JSON file: courseInstances\/badCourseInstance\/infoCourseInstance.json/
    );
  });

  it('records an error if a nested course instance directory does not eventually contain an infoCourseInstance.json file', async () => {
    const courseData = util.getCourseData();
    const nestedCourseInstanceStructure = [
      'subfolder1',
      'subfolder2',
      'subfolder3',
      'nestedCourseInstance',
    ];
    const courseInstanceId = nestedCourseInstanceStructure.join('/');
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'courseInstances', ...nestedCourseInstanceStructure));
    await util.syncCourseData(courseDir);

    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === courseInstanceId
    );
    assert.isOk(syncedCourseInstance);
    assert.match(
      syncedCourseInstance.sync_errors,
      /Missing JSON file: courseInstances\/subfolder1\/subfolder2\/subfolder3\/nestedCourseInstance\/infoCourseInstance.json/
    );

    // We should only record an error for the most deeply nested directories,
    // not any of the intermediate ones.
    for (let i = 0; i < nestedCourseInstanceStructure.length - 1; i++) {
      const partialNestedCourseInstanceStructure = nestedCourseInstanceStructure.slice(0, i);
      const partialCourseInstanceId = partialNestedCourseInstanceStructure.join('/');
      const syncedCourseInstance = syncedCourseInstances.find(
        (ci) => ci.short_name === partialCourseInstanceId
      );
      assert.isUndefined(syncedCourseInstance);
    }
  });

  it('correctly handles a new course instance with the same short name as a deleted course instance', async () => {
    const courseData = util.getCourseData();
    const courseInstance = makeCourseInstance();
    courseData.courseInstances['repeatedCourseInstance'] = courseInstance;
    const courseDir = await util.writeAndSyncCourseData(courseData);

    // now change the UUID of the course instance and re-sync
    courseInstance.courseInstance.uuid = '276eeddb-74e1-44e5-bfc5-3c39d79afa85';
    courseInstance.courseInstance.longName = 'test new long name';
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === 'repeatedCourseInstance' && ci.deleted_at == null
    );
    assert.equal(syncedCourseInstance.uuid, courseInstance.courseInstance.uuid);
    assert.equal(syncedCourseInstance.long_name, courseInstance.courseInstance.longName);
  });

  it('does not modify deleted course instance long names', async () => {
    const courseData = util.getCourseData();
    const originalCourseInstance = makeCourseInstance();
    courseData.courseInstances['repeatedCourseInstance'] = originalCourseInstance;
    const courseDir = await util.writeAndSyncCourseData(courseData);

    // now change the UUID and long name of the course instance and re-sync
    const newCourseInstance = JSON.parse(JSON.stringify(originalCourseInstance));
    newCourseInstance.courseInstance.uuid = '49c8b795-dfde-4c13-a040-0fd1ba711dc5';
    newCourseInstance.courseInstance.longName = 'changed long name';
    courseData.courseInstances['repeatedCourseInstance'] = newCourseInstance;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const deletedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === 'repeatedCourseInstance' && ci.deleted_at != null
    );
    assert.equal(deletedCourseInstance.uuid, originalCourseInstance.courseInstance.uuid);
    assert.equal(deletedCourseInstance.long_name, originalCourseInstance.courseInstance.longName);
  });

  it('does not add errors to deleted course instances', async () => {
    const courseData = util.getCourseData();
    const originalCourseInstance = makeCourseInstance();
    courseData.courseInstances['repeatedCourseInstance'] = originalCourseInstance;
    const courseDir = await util.writeAndSyncCourseData(courseData);

    // now change the UUID of the course instance, add an error and re-sync
    const newCourseInstance = JSON.parse(JSON.stringify(originalCourseInstance));
    newCourseInstance.courseInstance.uuid = '7902a94b-b025-4a33-9987-3b8196581bd2';
    delete newCourseInstance.courseInstance.longName; // will make the course instance broken
    courseData.courseInstances['repeatedCourseInstance'] = newCourseInstance;
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    // check that the newly-synced course instance has an error
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === 'repeatedCourseInstance' && ci.deleted_at == null
    );
    assert.equal(syncedCourseInstance.uuid, newCourseInstance.courseInstance.uuid);
    assert.match(syncedCourseInstance.sync_errors, /should have required property 'longName'/);

    // check that the old deleted course instance does not have any errors
    const deletedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === 'repeatedCourseInstance' && ci.deleted_at != null
    );
    assert.equal(deletedCourseInstance.uuid, originalCourseInstance.courseInstance.uuid);
    assert.equal(deletedCourseInstance.sync_errors, null);
  });
});
