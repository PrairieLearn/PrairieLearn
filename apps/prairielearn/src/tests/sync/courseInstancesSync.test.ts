import * as path from 'path';

import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { CourseInstanceSchema } from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';
import { selectCourseInstanceByUuid } from '../../models/course-instances.js';
import { type CourseInstanceJsonInput } from '../../schemas/infoCourseInstance.js';
import { FUTURE_DATE } from '../../sync/fromDisk/courseInstances.js';
import * as helperDb from '../helperDb.js';
import { withConfig } from '../utils/config.js';

import * as util from './util.js';

/**
 * Makes an empty course instance.
 */
function makeCourseInstance(): util.CourseInstanceData {
  return {
    courseInstance: {
      uuid: uuidv4(),
      longName: 'Test course instance',
    },
    assessments: {},
  };
}

describe('Course instance syncing', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(helperDb.resetDatabase);

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
      (ci) => ci.short_name === courseInstanceId,
    );
    assert.isOk(syncedCourseInstance);
  });

  it('syncs access rules', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess = [
      {
        startDate: '2024-01-01T00:00:00',
        endDate: '2024-01-31T00:00:00',
        uids: ['student@example.com'],
      },
      {
        startDate: '2024-02-01T00:00:00',
        endDate: '2024-02-28T00:00:00',
        institution: 'Any',
      },
    ];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedAccessRules = await util.dumpTable('course_instance_access_rules');
    assert.equal(
      syncedAccessRules.length,
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess?.length,
    );

    // Ensure that the access rules are correctly synced.
    const firstRule = syncedAccessRules.find((ar) => ar.number === 1);
    assert.isOk(firstRule);
    assert.equal(firstRule.start_date.getTime(), new Date('2024-01-01T06:00:00.000Z').getTime());
    assert.equal(firstRule.end_date.getTime(), new Date('2024-01-31T06:00:00.000Z').getTime());
    assert.deepEqual(firstRule.uids, ['student@example.com']);
    assert.isNull(firstRule.institution);

    const secondRule = syncedAccessRules.find((ar) => ar.number === 2);
    assert.isOk(secondRule);
    assert.equal(secondRule.start_date.getTime(), new Date('2024-02-01T06:00:00.000Z').getTime());
    assert.equal(secondRule.end_date.getTime(), new Date('2024-02-28T06:00:00.000Z').getTime());
    assert.isNull(secondRule.uids);
    assert.equal(secondRule.institution, 'Any');

    // Ensure that excess access rules are deleted. Delete the first one and sync again.
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess.shift();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedAccessRule = await util.dumpTable('course_instance_access_rules');
    assert.equal(newSyncedAccessRule.length, 1);

    // Ensure the remaining access rule is the correct one.
    const remainingRule = newSyncedAccessRule[0];
    assert.equal(
      remainingRule.start_date.getTime(),
      new Date('2024-02-01T06:00:00.000Z').getTime(),
    );
    assert.equal(remainingRule.end_date.getTime(), new Date('2024-02-28T06:00:00.000Z').getTime());
    assert.isNull(remainingRule.uids);
    assert.equal(remainingRule.institution, 'Any');
  });

  it('soft-deletes and restores course instances', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const originalCourseInstance = courseData.courseInstances[util.COURSE_INSTANCE_ID];
    let syncedCourseInstances = await util.dumpTable('course_instances');
    const originalSyncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID,
    );
    assert.isOk(originalSyncedCourseInstance);

    delete courseData.courseInstances[util.COURSE_INSTANCE_ID];
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedCourseInstances = await util.dumpTable('course_instances');
    const deletedSyncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID,
    );
    assert.isOk(deletedSyncedCourseInstance);
    assert.isNotNull(deletedSyncedCourseInstance?.deleted_at);

    courseData.courseInstances[util.COURSE_INSTANCE_ID] = originalCourseInstance;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedCourseInstances = await util.dumpTable('course_instances');
    const newSyncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID,
    );
    assert.isOk(newSyncedCourseInstance);
    assert.isNull(newSyncedCourseInstance?.deleted_at);
    assert.deepEqual(newSyncedCourseInstance, originalSyncedCourseInstance);
  });

  it('gracefully handles a missing assessments directory', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.remove(
      path.join(courseDir, 'courseInstances', util.COURSE_INSTANCE_ID, 'assessments'),
    );
    await util.syncCourseData(courseDir);
  });

  it('syncs empty arrays correctly', async () => {
    // Note that we want the database to contain empty arrays, not NULL
    const courseData = util.getCourseData();
    const courseInstanceAllowAccessRule =
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess?.[0];
    if (!courseInstanceAllowAccessRule) {
      throw new Error('Could not find course instance allowAccess rule');
    }
    courseInstanceAllowAccessRule.uids = [];
    await util.writeAndSyncCourseData(courseData);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID,
    );
    const syncedAccessRules = (await util.dumpTable('course_instance_access_rules')).filter((ar) =>
      idsEqual(ar.course_instance_id, syncedCourseInstance?.id),
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
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID,
    );
    assert.match(
      firstCourseInstance?.sync_warnings,
      /UUID "a17b1abd-eaf6-45dc-99bc-9890a7fb345e" is used in other course instances: newinstance/,
    );
    const secondCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === 'newinstance',
    );
    assert.match(
      secondCourseInstance?.sync_warnings,
      new RegExp(
        `UUID "a17b1abd-eaf6-45dc-99bc-9890a7fb345e" is used in other course instances: ${util.COURSE_INSTANCE_ID}`,
      ),
    );
  });

  it('records an error if an allowAccess rule has a start date after the end date', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess?.push({
      startDate: '2020-01-01T11:11:11',
      endDate: '2019-01-01T00:00:00',
    });
    await util.writeAndSyncCourseData(courseData);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID,
    );
    assert.match(
      syncedCourseInstance?.sync_errors,
      /Invalid allowAccess rule: startDate \(2020-01-01T11:11:11\) must not be after endDate \(2019-01-01T00:00:00\)/,
    );
  });

  it('records an error if an allowAccess rule has an invalid start date', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess?.push({
      startDate: 'not a valid date',
      endDate: '2019-01-01T00:00:00',
    });
    await util.writeAndSyncCourseData(courseData);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID,
    );
    assert.match(
      syncedCourseInstance?.sync_errors,
      /Invalid allowAccess rule: startDate \(not a valid date\) is not valid/,
    );
  });

  it('records an error if an allowAccess rule has an invalid end date', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess?.push({
      startDate: '2020-01-01T11:11:11',
      endDate: 'not a valid date',
    });
    await util.writeAndSyncCourseData(courseData);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID,
    );
    assert.match(
      syncedCourseInstance?.sync_errors,
      /Invalid allowAccess rule: endDate \(not a valid date\) is not valid/,
    );
  });

  it('records an error if a course instance directory is missing an infoCourseInstance.json file', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'courseInstances', 'badCourseInstance'));
    await util.syncCourseData(courseDir);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === 'badCourseInstance',
    );
    assert.isOk(syncedCourseInstance);
    assert.match(
      syncedCourseInstance?.sync_errors,
      /Missing JSON file: courseInstances\/badCourseInstance\/infoCourseInstance.json/,
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
      (ci) => ci.short_name === courseInstanceId,
    );
    assert.isOk(syncedCourseInstance);
    assert.match(
      syncedCourseInstance?.sync_errors,
      /Missing JSON file: courseInstances\/subfolder1\/subfolder2\/subfolder3\/nestedCourseInstance\/infoCourseInstance.json/,
    );

    // We should only record an error for the most deeply nested directories,
    // not any of the intermediate ones.
    for (let i = 0; i < nestedCourseInstanceStructure.length - 1; i++) {
      const partialNestedCourseInstanceStructure = nestedCourseInstanceStructure.slice(0, i);
      const partialCourseInstanceId = partialNestedCourseInstanceStructure.join('/');
      const syncedCourseInstance = syncedCourseInstances.find(
        (ci) => ci.short_name === partialCourseInstanceId,
      );
      assert.isUndefined(syncedCourseInstance);
    }
  });

  it('correctly handles a new course instance with the same short name as a deleted course instance', async () => {
    const courseData = util.getCourseData();
    const courseInstance = makeCourseInstance();
    courseData.courseInstances['repeatedCourseInstance'] = courseInstance;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // now change the UUID of the course instance and re-sync
    courseInstance.courseInstance.uuid = '276eeddb-74e1-44e5-bfc5-3c39d79afa85';
    courseInstance.courseInstance.longName = 'test new long name';
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === 'repeatedCourseInstance' && ci.deleted_at == null,
    );
    assert.equal(syncedCourseInstance?.uuid, courseInstance.courseInstance.uuid);
    assert.equal(syncedCourseInstance?.long_name, courseInstance.courseInstance.longName);
  });

  it('does not modify deleted course instance long names', async () => {
    const courseData = util.getCourseData();
    const originalCourseInstance = makeCourseInstance();
    courseData.courseInstances['repeatedCourseInstance'] = originalCourseInstance;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // now change the UUID and long name of the course instance and re-sync
    const newCourseInstance = structuredClone(originalCourseInstance);
    newCourseInstance.courseInstance.uuid = '49c8b795-dfde-4c13-a040-0fd1ba711dc5';
    newCourseInstance.courseInstance.longName = 'changed long name';
    courseData.courseInstances['repeatedCourseInstance'] = newCourseInstance;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const deletedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === 'repeatedCourseInstance' && ci.deleted_at != null,
    );
    assert.equal(deletedCourseInstance?.uuid, originalCourseInstance.courseInstance.uuid);
    assert.equal(deletedCourseInstance?.long_name, originalCourseInstance.courseInstance.longName);
  });

  it('does not add errors to deleted course instances', async () => {
    const courseData = util.getCourseData();
    const originalCourseInstance = makeCourseInstance();
    courseData.courseInstances['repeatedCourseInstance'] = originalCourseInstance;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // now change the UUID of the course instance, add an error and re-sync
    const newCourseInstance = structuredClone(originalCourseInstance);
    newCourseInstance.courseInstance.uuid = '7902a94b-b025-4a33-9987-3b8196581bd2';
    // @ts-expect-error we are intentionally breaking the type
    delete newCourseInstance.courseInstance.longName; // will make the course instance broken
    courseData.courseInstances['repeatedCourseInstance'] = newCourseInstance;
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    // check that the newly-synced course instance has an error
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === 'repeatedCourseInstance' && ci.deleted_at == null,
    );
    assert.equal(syncedCourseInstance?.uuid, newCourseInstance.courseInstance.uuid);
    assert.match(syncedCourseInstance?.sync_errors, /must have required property 'longName'/);

    // check that the old deleted course instance does not have any errors
    const deletedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === 'repeatedCourseInstance' && ci.deleted_at != null,
    );
    assert.equal(deletedCourseInstance?.uuid, originalCourseInstance.courseInstance.uuid);
    assert.equal(deletedCourseInstance?.sync_errors, null);
  });

  // https://github.com/PrairieLearn/PrairieLearn/issues/6539
  it('handles unique sequence of renames and duplicate UUIDs', async () => {
    const courseData = util.getCourseData();

    // Start with a clean slate.
    courseData.courseInstances = {};

    // Write and sync a single course instance.
    const originalCourseInstance = makeCourseInstance();
    originalCourseInstance.courseInstance.uuid = '0e8097aa-b554-4908-9eac-d46a78d6c249';
    courseData.courseInstances['a'] = originalCourseInstance;
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // Now "move" the above course instance to a new directory AND add another with the
    // same UUID.
    delete courseData.courseInstances['a'];
    courseData.courseInstances['b'] = originalCourseInstance;
    courseData.courseInstances['c'] = originalCourseInstance;
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    // Now "fix" the duplicate UUID.
    courseData.courseInstances['c'] = {
      ...originalCourseInstance,
      courseInstance: {
        ...originalCourseInstance.courseInstance,
        uuid: '0e3097ba-b554-4908-9eac-d46a78d6c249',
      },
    };
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    const courseInstances = await util.dumpTable('course_instances');

    // Original course instance should not exist.
    const originalCourseInstanceRow = courseInstances.find((ci) => ci.short_name === 'a');
    assert.isUndefined(originalCourseInstanceRow);

    // New course instances should exist and have the correct UUIDs.
    const newCourseInstanceRow1 = courseInstances.find(
      (ci) => ci.short_name === 'b' && ci.deleted_at === null,
    );
    assert.isNull(newCourseInstanceRow1?.deleted_at);
    assert.equal(newCourseInstanceRow1?.uuid, '0e8097aa-b554-4908-9eac-d46a78d6c249');
    const newCourseInstanceRow2 = courseInstances.find(
      (q) => q.short_name === 'c' && q.deleted_at === null,
    );
    assert.isNull(newCourseInstanceRow2?.deleted_at);
    assert.equal(newCourseInstanceRow2?.uuid, '0e3097ba-b554-4908-9eac-d46a78d6c249');
  });

  it('syncs string comments correctly', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.comment =
      'course instance comment';
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess = [
      {
        comment: 'course instance access rule comment',
      },
    ];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    assert.equal(syncedCourseInstances[0].json_comment, 'course instance comment');
    const syncedAccessRules = await util.dumpTable('course_instance_access_rules');
    assert.equal(syncedAccessRules[0].json_comment, 'course instance access rule comment');
  });

  it('syncs array comments correctly', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.comment = [
      'course instance comment',
      'course instance comment 2',
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess = [
      {
        comment: ['course instance access rule comment', 'course instance access rule comment 2'],
      },
    ];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    assert.deepEqual(syncedCourseInstances[0].json_comment, [
      'course instance comment',
      'course instance comment 2',
    ]);
    const syncedAccessRules = await util.dumpTable('course_instance_access_rules');
    assert.deepEqual(syncedAccessRules[0].json_comment, [
      'course instance access rule comment',
      'course instance access rule comment 2',
    ]);
  });

  it('syncs object comments correctly', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.comment = {
      comment: 'course instance comment',
      comment2: 'course instance comment 2',
    };
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess = [
      {
        comment: {
          comment: 'course instance access rule comment',
          comment2: 'course instance access rule comment 2',
        },
      },
    ];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    assert.deepEqual(syncedCourseInstances[0].json_comment, {
      comment: 'course instance comment',
      comment2: 'course instance comment 2',
    });
    const syncedAccessRules = await util.dumpTable('course_instance_access_rules');
    assert.deepEqual(syncedAccessRules[0].json_comment, {
      comment: 'course instance access rule comment',
      comment2: 'course instance access rule comment 2',
    });
  });

  it('records a warning for UIDs containing commas or spaces', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess = [
      {
        startDate: '2024-01-01T00:00:00',
        endDate: '3024-01-31T00:00:00',
        uids: ['foo@example.com,bar@example.com', 'biz@example.com baz@example.com'],
      },
    ];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedCourseInstances = await util.dumpTable('course_instances');
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID,
    );
    assert.isOk(syncedCourseInstance);
    assert.match(
      syncedCourseInstance?.sync_warnings,
      /The following access rule UIDs contain unexpected whitespace: "biz@example.com baz@example.com"/,
    );
    assert.match(
      syncedCourseInstance?.sync_warnings,
      /The following access rule UIDs contain unexpected commas: "foo@example.com,bar@example.com"/,
    );
  });

  it('forbids sharing settings when sharing is not enabled', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.shareSourcePublicly = true;

    await withConfig({ checkSharingOnSync: true }, async () => {
      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);
    });

    const syncedCourseInstances = await util.dumpTableWithSchema(
      'course_instances',
      CourseInstanceSchema,
    );
    const syncedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === util.COURSE_INSTANCE_ID,
    );
    assert.isOk(syncedCourseInstance);
    assert.match(syncedCourseInstance?.sync_errors ?? '', /"shareSourcePublicly" cannot be used/);
  });

  it('syncs enrollment settings correctly', async () => {
    const schemaMappings: {
      json: CourseInstanceJsonInput['enrollment'];
      db: {
        self_enrollment_enabled_before: number | null;
        self_enrollment_requires_secret_link: boolean;
        enrollment_lti_enforced_after: number | null;
      };
    }[] = [
      {
        json: {
          selfEnrollmentEnabled: true,
          selfEnrollmentRequiresSecretLink: true,
          ltiEnforced: true,
        },
        db: {
          self_enrollment_enabled_before: FUTURE_DATE.getTime(),
          self_enrollment_requires_secret_link: true,
          enrollment_lti_enforced_after: null,
        },
      },
      {
        json: {
          selfEnrollmentEnabled: { beforeDate: new Date('2025-06-15T00:00:00Z').toISOString() },
          ltiEnforced: { afterDate: new Date('2025-12-31T23:59:59Z').toISOString() },
        },
        db: {
          self_enrollment_enabled_before: new Date('2025-06-15T00:00:00Z').getTime(),
          self_enrollment_requires_secret_link: false,
          enrollment_lti_enforced_after: new Date('2025-12-31T23:59:59Z').getTime(),
        },
      },
      {
        json: undefined,
        db: {
          self_enrollment_enabled_before: FUTURE_DATE.getTime(),
          self_enrollment_requires_secret_link: false,
          enrollment_lti_enforced_after: FUTURE_DATE.getTime(),
        },
      },
      {
        json: {
          selfEnrollmentEnabled: false,
          ltiEnforced: false,
        },
        db: {
          self_enrollment_enabled_before: null,
          self_enrollment_requires_secret_link: false,
          enrollment_lti_enforced_after: FUTURE_DATE.getTime(),
        },
      },
    ];

    // Test various enrollment configurations
    for (const { json, db } of schemaMappings) {
      const courseData = util.getCourseData();
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.enrollment = json;

      const courseDir = await util.writeCourseToTempDirectory(courseData);
      const results = await util.syncCourseData(courseDir);
      assert.isOk(results.status === 'complete');
      const courseInstance = results.courseData.courseInstances[util.COURSE_INSTANCE_ID];
      const courseInstanceErrors = courseInstance.courseInstance.errors;
      const courseInstanceUUID = courseInstance.courseInstance.uuid;
      assert.isEmpty(courseInstanceErrors);
      assert.isDefined(courseInstanceUUID);

      const syncedCourseInstance = await selectCourseInstanceByUuid({
        course_id: results.courseId,
        uuid: courseInstanceUUID,
      });
      assert.isOk(syncedCourseInstance);

      const result = {
        self_enrollment_enabled_before:
          syncedCourseInstance.self_enrollment_enabled_before?.getTime() ?? null,
        self_enrollment_requires_secret_link:
          syncedCourseInstance.self_enrollment_requires_secret_link,
        enrollment_lti_enforced_after:
          syncedCourseInstance.enrollment_lti_enforced_after?.getTime() ?? null,
      };

      assert.deepEqual(result, db);
    }
  });
});
