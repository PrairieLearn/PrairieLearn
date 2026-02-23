/* eslint-disable @typescript-eslint/dot-notation */
import * as path from 'path';

import { Temporal } from '@js-temporal/polyfill';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { CourseInstanceAccessRuleSchema, CourseInstanceSchema } from '../../lib/db-types.js';
import { idsEqual } from '../../lib/id.js';
import { selectCourseInstanceByUuid } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';
import { selectStudentLabelsInCourseInstance } from '../../models/student-label.js';
import { type CourseInstanceJsonInput } from '../../schemas/infoCourseInstance.js';
import * as helperDb from '../helperDb.js';
import { withConfig } from '../utils/config.js';

import * as util from './util.js';

/**
 * Makes an empty course instance.
 */
function makeCourseInstance(): util.CourseInstanceData {
  return {
    courseInstance: {
      uuid: crypto.randomUUID(),
      longName: 'Test course instance',
    },
    assessments: {},
  };
}

async function findSyncedCourseInstance(shortName: string) {
  const syncedCourseInstances = await util.dumpTableWithSchema(
    'course_instances',
    CourseInstanceSchema,
  );
  const syncedCourseInstance = syncedCourseInstances.find((ci) => ci.short_name === shortName);
  assert.isOk(syncedCourseInstance);
  return syncedCourseInstance;
}

async function findSyncedUndeletedCourseInstance(shortName: string) {
  const syncedCourseInstances = await util.dumpTableWithSchema(
    'course_instances',
    CourseInstanceSchema,
  );
  const syncedCourseInstance = syncedCourseInstances.find(
    (ci) => ci.short_name === shortName && ci.deleted_at == null,
  );
  assert.isOk(syncedCourseInstance);
  return syncedCourseInstance;
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

    await findSyncedCourseInstance(courseInstanceId);
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
    const syncedAccessRules = await util.dumpTableWithSchema(
      'course_instance_access_rules',
      CourseInstanceAccessRuleSchema,
    );
    assert.equal(
      syncedAccessRules.length,
      courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess.length,
    );

    // Ensure that the access rules are correctly synced.
    const firstRule = syncedAccessRules.find((ar) => ar.number === 1);
    assert.isOk(firstRule);
    assert.equal(firstRule.start_date?.getTime(), new Date('2024-01-01T06:00:00.000Z').getTime());
    assert.equal(firstRule.end_date?.getTime(), new Date('2024-01-31T06:00:00.000Z').getTime());
    assert.deepEqual(firstRule.uids, ['student@example.com']);
    assert.isNull(firstRule.institution);

    const secondRule = syncedAccessRules.find((ar) => ar.number === 2);
    assert.isOk(secondRule);
    assert.equal(secondRule.start_date?.getTime(), new Date('2024-02-01T06:00:00.000Z').getTime());
    assert.equal(secondRule.end_date?.getTime(), new Date('2024-02-28T06:00:00.000Z').getTime());
    assert.isNull(secondRule.uids);
    assert.equal(secondRule.institution, 'Any');

    // Ensure that excess access rules are deleted. Delete the first one and sync again.
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess.shift();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedAccessRule = await util.dumpTableWithSchema(
      'course_instance_access_rules',
      CourseInstanceAccessRuleSchema,
    );
    assert.equal(newSyncedAccessRule.length, 1);

    // Ensure the remaining access rule is the correct one.
    const remainingRule = newSyncedAccessRule[0];
    assert.equal(
      remainingRule.start_date?.getTime(),
      new Date('2024-02-01T06:00:00.000Z').getTime(),
    );
    assert.equal(remainingRule.end_date?.getTime(), new Date('2024-02-28T06:00:00.000Z').getTime());
    assert.isNull(remainingRule.uids);
    assert.equal(remainingRule.institution, 'Any');
  });

  describe('syncs publishing settings correctly', () => {
    const timezone = 'America/New_York';

    // We pick an arbitrary date to use.
    const date = new Date('2025-09-05T20:52:49.000Z');

    // In JSON, the date must be formatted like `2025-01-01T00:00:00` and will
    // be interpreted in the course instance's timezone.
    const jsonDate = Temporal.Instant.from(date.toISOString())
      .toZonedDateTimeISO(timezone)
      .toPlainDateTime()
      .toString();

    const schemaMappings: {
      json: {
        publishing?: CourseInstanceJsonInput['publishing'];
        allowAccess?: CourseInstanceJsonInput['allowAccess'];
      };
      db: {
        publishing_start_date: Date | null;
        publishing_end_date: Date | null;
        modern_publishing: boolean;
      } | null;
      errors: string[];
      warnings: string[];
    }[] = [
      {
        json: { publishing: undefined, allowAccess: [] },
        db: {
          modern_publishing: false,
          publishing_start_date: null,
          publishing_end_date: null,
        },
        warnings: [],
        errors: [],
      },
      {
        json: { publishing: {} },
        db: {
          modern_publishing: true,
          publishing_start_date: null,
          publishing_end_date: null,
        },
        warnings: [],
        errors: [],
      },
      {
        json: {
          publishing: {
            endDate: jsonDate,
          },
        },
        db: null,
        warnings: [],
        errors: ['"publishing.startDate" is required if "publishing.endDate" is specified.'],
      },
      {
        json: {
          publishing: {
            startDate: jsonDate,
            endDate: jsonDate,
          },
        },
        db: {
          modern_publishing: true,
          publishing_start_date: date,
          publishing_end_date: date,
        },
        warnings: [],
        errors: [],
      },
      {
        json: {
          publishing: {
            startDate: jsonDate,
          },
        },
        db: null,
        warnings: [],
        errors: ['"publishing.endDate" is required if "publishing.startDate" is specified.'],
      },
      {
        json: {
          publishing: {
            startDate: 'not a date',
            endDate: jsonDate,
          },
        },
        db: null,
        warnings: [],
        errors: ['"publishing.startDate" is not a valid date.'],
      },
      {
        json: {
          publishing: {
            endDate: 'not a date',
          },
        },
        db: null,
        warnings: [],
        errors: [
          '"publishing.startDate" is required if "publishing.endDate" is specified.',
          '"publishing.endDate" is not a valid date.',
        ],
      },
      {
        json: {
          publishing: {
            startDate: '2025-12-01T00:00:00',
            endDate: '2025-06-01T00:00:00',
          },
        },
        db: null,
        warnings: [],
        errors: ['"publishing.startDate" must be before "publishing.endDate".'],
      },
    ];

    let i = 0;
    for (const { json, db, errors, warnings } of schemaMappings) {
      it(`access control configuration #${i++}`, async () => {
        const courseData = util.getCourseData();
        courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.publishing =
          json.publishing;
        courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess =
          json.allowAccess;
        courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.timezone = timezone;

        const courseDir = await util.writeCourseToTempDirectory(courseData);
        const results = await util.syncCourseData(courseDir);
        assert.isOk(results.status === 'complete');
        const courseInstance = results.courseData.courseInstances[util.COURSE_INSTANCE_ID];
        const courseInstanceErrors = courseInstance.courseInstance.errors;
        const courseInstanceWarnings = courseInstance.courseInstance.warnings;
        const courseInstanceUUID = courseInstance.courseInstance.uuid;
        assert.equal(JSON.stringify(courseInstanceErrors), JSON.stringify(errors));
        assert.equal(JSON.stringify(courseInstanceWarnings), JSON.stringify(warnings));
        assert.isDefined(courseInstanceUUID);

        const syncedCourseInstance = await selectCourseInstanceByUuid({
          course: await selectCourseById(results.courseId),
          uuid: courseInstanceUUID,
        });
        assert.isOk(syncedCourseInstance);

        if (courseInstanceErrors.length > 0) {
          return;
        }

        const result = {
          publishing_start_date: syncedCourseInstance.publishing_start_date,
          publishing_end_date: syncedCourseInstance.publishing_end_date,
          modern_publishing: syncedCourseInstance.modern_publishing,
        };

        assert.deepEqual(result, db);
      });
    }
  });

  it('soft-deletes and restores course instances', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const originalCourseInstance = courseData.courseInstances[util.COURSE_INSTANCE_ID];
    const originalSyncedCourseInstance = await findSyncedCourseInstance(util.COURSE_INSTANCE_ID);

    delete courseData.courseInstances[util.COURSE_INSTANCE_ID];
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const deletedSyncedCourseInstance = await findSyncedCourseInstance(util.COURSE_INSTANCE_ID);
    assert.isNotNull(deletedSyncedCourseInstance.deleted_at);

    courseData.courseInstances[util.COURSE_INSTANCE_ID] = originalCourseInstance;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedCourseInstance = await findSyncedCourseInstance(util.COURSE_INSTANCE_ID);
    assert.isNull(newSyncedCourseInstance.deleted_at);
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
    const syncedCourseInstance = await findSyncedCourseInstance(util.COURSE_INSTANCE_ID);
    const syncedAccessRules = (
      await util.dumpTableWithSchema('course_instance_access_rules', CourseInstanceAccessRuleSchema)
    ).filter((ar) => idsEqual(ar.course_instance_id, syncedCourseInstance.id));
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
    const firstCourseInstance = await findSyncedCourseInstance(util.COURSE_INSTANCE_ID);
    assert.isNotNull(firstCourseInstance.sync_warnings);
    assert.match(
      firstCourseInstance.sync_warnings,
      /UUID "a17b1abd-eaf6-45dc-99bc-9890a7fb345e" is used in other course instances: newinstance/,
    );
    const secondCourseInstance = await findSyncedCourseInstance('newinstance');
    assert.isNotNull(secondCourseInstance.sync_warnings);
    assert.match(
      secondCourseInstance.sync_warnings,
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
    const syncedCourseInstance = await findSyncedCourseInstance(util.COURSE_INSTANCE_ID);
    assert.isNotNull(syncedCourseInstance.sync_errors);
    assert.match(
      syncedCourseInstance.sync_errors,
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
    const syncedCourseInstance = await findSyncedCourseInstance(util.COURSE_INSTANCE_ID);
    assert.isNotNull(syncedCourseInstance.sync_errors);
    assert.match(
      syncedCourseInstance.sync_errors,
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
    const syncedCourseInstance = await findSyncedCourseInstance(util.COURSE_INSTANCE_ID);
    assert.isNotNull(syncedCourseInstance.sync_errors);
    assert.match(
      syncedCourseInstance.sync_errors,
      /Invalid allowAccess rule: endDate \(not a valid date\) is not valid/,
    );
  });

  it('records an error if a course instance directory is missing an infoCourseInstance.json file', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'courseInstances', 'badCourseInstance'));
    await util.syncCourseData(courseDir);
    const syncedCourseInstance = await findSyncedCourseInstance('badCourseInstance');
    assert.isNotNull(syncedCourseInstance.sync_errors);
    assert.match(
      syncedCourseInstance.sync_errors,
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

    const syncedCourseInstance = await findSyncedCourseInstance(courseInstanceId);
    assert.isNotNull(syncedCourseInstance.sync_errors);
    assert.match(
      syncedCourseInstance.sync_errors,
      /Missing JSON file: courseInstances\/subfolder1\/subfolder2\/subfolder3\/nestedCourseInstance\/infoCourseInstance.json/,
    );

    const syncedCourseInstances = await util.dumpTableWithSchema(
      'course_instances',
      CourseInstanceSchema,
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
    const syncedCourseInstance = await findSyncedUndeletedCourseInstance('repeatedCourseInstance');
    assert.equal(syncedCourseInstance.uuid, courseInstance.courseInstance.uuid);
    assert.equal(syncedCourseInstance.long_name, courseInstance.courseInstance.longName);
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
    const syncedCourseInstances = await util.dumpTableWithSchema(
      'course_instances',
      CourseInstanceSchema,
    );
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
    const syncedCourseInstance = await findSyncedUndeletedCourseInstance('repeatedCourseInstance');
    assert.isDefined(syncedCourseInstance);
    assert.isNotNull(syncedCourseInstance.sync_errors);
    assert.equal(syncedCourseInstance.uuid, newCourseInstance.courseInstance.uuid);
    assert.match(syncedCourseInstance.sync_errors, /must have required property 'longName'/);

    // check that the old deleted course instance does not have any errors
    const syncedCourseInstances = await util.dumpTableWithSchema(
      'course_instances',
      CourseInstanceSchema,
    );
    const deletedCourseInstance = syncedCourseInstances.find(
      (ci) => ci.short_name === 'repeatedCourseInstance' && ci.deleted_at != null,
    );
    assert.isOk(deletedCourseInstance);
    assert.equal(deletedCourseInstance.uuid, originalCourseInstance.courseInstance.uuid);
    assert.equal(deletedCourseInstance.sync_errors, null);
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

    // Original course instance should not exist.
    const courseInstances = await util.dumpTableWithSchema(
      'course_instances',
      CourseInstanceSchema,
    );
    const originalCourseInstanceRow = courseInstances.find((ci) => ci.short_name === 'a');
    assert.isUndefined(originalCourseInstanceRow);

    // New course instances should exist and have the correct UUIDs.
    const newCourseInstanceRow1 = await findSyncedUndeletedCourseInstance('b');
    assert.isNull(newCourseInstanceRow1.deleted_at);
    assert.equal(newCourseInstanceRow1.uuid, '0e8097aa-b554-4908-9eac-d46a78d6c249');
    const newCourseInstanceRow2 = await findSyncedUndeletedCourseInstance('c');
    assert.isNull(newCourseInstanceRow2.deleted_at);
    assert.equal(newCourseInstanceRow2.uuid, '0e3097ba-b554-4908-9eac-d46a78d6c249');
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
    const syncedCourseInstances = await util.dumpTableWithSchema(
      'course_instances',
      CourseInstanceSchema,
    );
    assert.equal(syncedCourseInstances[0].json_comment, 'course instance comment');
    const syncedAccessRules = await util.dumpTableWithSchema(
      'course_instance_access_rules',
      CourseInstanceAccessRuleSchema,
    );
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
    const syncedCourseInstances = await util.dumpTableWithSchema(
      'course_instances',
      CourseInstanceSchema,
    );
    assert.deepEqual(syncedCourseInstances[0].json_comment, [
      'course instance comment',
      'course instance comment 2',
    ]);
    const syncedAccessRules = await util.dumpTableWithSchema(
      'course_instance_access_rules',
      CourseInstanceAccessRuleSchema,
    );
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
    const syncedCourseInstances = await util.dumpTableWithSchema(
      'course_instances',
      CourseInstanceSchema,
    );
    assert.deepEqual(syncedCourseInstances[0].json_comment, {
      comment: 'course instance comment',
      comment2: 'course instance comment 2',
    });
    const syncedAccessRules = await util.dumpTableWithSchema(
      'course_instance_access_rules',
      CourseInstanceAccessRuleSchema,
    );
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
    const syncedCourseInstance = await findSyncedCourseInstance(util.COURSE_INSTANCE_ID);
    assert.isNotNull(syncedCourseInstance.sync_warnings);
    assert.match(
      syncedCourseInstance.sync_warnings,
      /The following access rule UIDs contain unexpected whitespace: "biz@example.com baz@example.com"/,
    );
    assert.match(
      syncedCourseInstance.sync_warnings,
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

    const syncedCourseInstance = await findSyncedCourseInstance(util.COURSE_INSTANCE_ID);
    assert.isNotNull(syncedCourseInstance.sync_errors);
    assert.match(syncedCourseInstance.sync_errors, /"shareSourcePublicly" cannot be used/);
  });

  describe('syncs self-enrollment settings correctly', async () => {
    const timezone = 'America/New_York';

    const date = new Date('2025-09-05T20:52:49.000Z');

    const jsonDate = Temporal.Instant.from(date.toISOString())
      .toZonedDateTimeISO(timezone)
      .toPlainDateTime()
      .toString();

    const schemaMappings: {
      json: CourseInstanceJsonInput['selfEnrollment'];
      db: {
        self_enrollment_enabled: boolean;
        self_enrollment_enabled_before_date: Date | null;
        self_enrollment_restrict_to_institution: boolean;
        self_enrollment_use_enrollment_code: boolean;
      } | null;
      errors: string[];
    }[] = [
      {
        json: {
          enabled: true,
          useEnrollmentCode: true,
        },
        db: {
          self_enrollment_enabled: true,
          self_enrollment_enabled_before_date: null,
          self_enrollment_restrict_to_institution: true,
          self_enrollment_use_enrollment_code: true,
        },
        errors: [],
      },
      {
        json: {
          enabled: false,
          beforeDate: jsonDate,
          useEnrollmentCode: true,
        },
        db: {
          self_enrollment_enabled: false,
          self_enrollment_enabled_before_date: date,
          self_enrollment_restrict_to_institution: true,
          self_enrollment_use_enrollment_code: true,
        },
        errors: [],
      },
      {
        json: {
          beforeDate: jsonDate,
          useEnrollmentCode: true,
        },
        db: {
          self_enrollment_enabled: true,
          self_enrollment_enabled_before_date: date,
          self_enrollment_restrict_to_institution: true,
          self_enrollment_use_enrollment_code: true,
        },
        errors: [],
      },
      {
        json: undefined,
        db: {
          self_enrollment_enabled: true,
          self_enrollment_enabled_before_date: null,
          self_enrollment_restrict_to_institution: true,
          self_enrollment_use_enrollment_code: false,
        },
        errors: [],
      },
      {
        json: {
          enabled: false,
        },
        db: {
          self_enrollment_enabled: false,
          self_enrollment_enabled_before_date: null,
          self_enrollment_restrict_to_institution: true,
          self_enrollment_use_enrollment_code: false,
        },
        errors: [],
      },
      {
        json: {
          enabled: true,
        },
        db: {
          self_enrollment_enabled: true,
          self_enrollment_enabled_before_date: null,
          self_enrollment_restrict_to_institution: true,
          self_enrollment_use_enrollment_code: false,
        },
        errors: [],
      },
      {
        json: {
          enabled: true,
          restrictToInstitution: false,
        },
        db: {
          self_enrollment_enabled: true,
          self_enrollment_enabled_before_date: null,
          self_enrollment_restrict_to_institution: false,
          self_enrollment_use_enrollment_code: false,
        },
        errors: [],
      },
      {
        json: {
          enabled: true,
          beforeDate: 'not a date',
        },
        db: null,
        errors: ['"selfEnrollment.beforeDate" is not a valid date.'],
      },
    ];

    let i = 0;
    for (const { json, db, errors } of schemaMappings) {
      it(`self-enrollment configuration #${i++}`, async () => {
        const courseData = util.getCourseData();
        courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.selfEnrollment = json;
        // You can't configure selfEnrollment and allowAccess at the same time.
        courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.allowAccess = undefined;
        courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.timezone = timezone;

        const courseDir = await util.writeCourseToTempDirectory(courseData);
        const results = await util.syncCourseData(courseDir);
        assert.isOk(results.status === 'complete');
        const courseInstance = results.courseData.courseInstances[util.COURSE_INSTANCE_ID];
        const courseInstanceErrors = courseInstance.courseInstance.errors;
        const courseInstanceUUID = courseInstance.courseInstance.uuid;
        assert.equal(JSON.stringify(courseInstanceErrors), JSON.stringify(errors));
        assert.isDefined(courseInstanceUUID);

        if (courseInstanceErrors.length > 0) {
          return;
        }

        const syncedCourseInstance = await selectCourseInstanceByUuid({
          course: await selectCourseById(results.courseId),
          uuid: courseInstanceUUID,
        });
        assert.isOk(syncedCourseInstance);

        const result = {
          self_enrollment_enabled: syncedCourseInstance.self_enrollment_enabled,
          self_enrollment_enabled_before_date:
            syncedCourseInstance.self_enrollment_enabled_before_date,
          self_enrollment_restrict_to_institution:
            syncedCourseInstance.self_enrollment_restrict_to_institution,
          self_enrollment_use_enrollment_code:
            syncedCourseInstance.self_enrollment_use_enrollment_code,
        };

        assert.deepEqual(result, db);
      });
    }
  });

  it('preserves student labels when course instance JSON becomes invalid', async () => {
    const courseData = util.getCourseData();
    const labelUuid = crypto.randomUUID();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
      { uuid: labelUuid, name: 'Section A', color: 'red1' },
    ];
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    const syncedCourseInstance = await findSyncedCourseInstance(util.COURSE_INSTANCE_ID);
    const labelsBefore = await selectStudentLabelsInCourseInstance(syncedCourseInstance);
    assert.lengthOf(labelsBefore, 1);
    assert.equal(labelsBefore[0].name, 'Section A');

    // Break the course instance JSON by removing the required longName field.
    // @ts-expect-error intentionally breaking the type
    delete courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.longName;
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    const syncedCourseInstanceAfter = await findSyncedCourseInstance(util.COURSE_INSTANCE_ID);
    assert.isNotNull(syncedCourseInstanceAfter.sync_errors);

    // Labels should still be present despite the sync error.
    const labelsAfter = await selectStudentLabelsInCourseInstance(syncedCourseInstanceAfter);
    assert.lengthOf(labelsAfter, 1);
    assert.equal(labelsAfter[0].name, 'Section A');
    assert.equal(labelsAfter[0].uuid, labelUuid);
  });

  it('records a warning if two student labels have the same name and deduplicates them', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].courseInstance.studentLabels = [
      { uuid: crypto.randomUUID(), name: 'Section A', color: 'red1' },
      { uuid: crypto.randomUUID(), name: 'Section A', color: 'blue1' },
    ];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedCourseInstance = await findSyncedCourseInstance(util.COURSE_INSTANCE_ID);
    assert.isNotNull(syncedCourseInstance.sync_warnings);
    assert.match(syncedCourseInstance.sync_warnings, /Found duplicates in 'studentLabels'/);

    const syncedLabels = await selectStudentLabelsInCourseInstance(syncedCourseInstance);
    assert.lengthOf(syncedLabels, 1);
    assert.equal(syncedLabels[0].name, 'Section A');
    assert.equal(syncedLabels[0].color, 'blue1');
  });
});
