import * as path from 'path';

import fs from 'fs-extra';
import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { config } from '../../lib/config.js';
import { CourseSchema } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { selectOrInsertCourseByPath } from '../../models/course.js';
import { writeErrorsAndWarningsForCourseData } from '../../sync/course-db.js';
import * as helperDb from '../helperDb.js';
import { withConfig } from '../utils/config.js';

import * as util from './util.js';

const [sampleFeature1, sampleFeature2] = features.allFeatures();
const invalidFeature = 'unknown-feature';

describe('Course syncing', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(helperDb.resetDatabase);

  it('syncs for known features as object', async () => {
    const courseData = util.getCourseData();
    courseData.course.options = {
      devModeFeatures: { [sampleFeature1]: true },
    };

    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedCourses = await util.dumpTableWithSchema('courses', CourseSchema);
    const syncedCourse = syncedCourses[0];
    assert.isNotOk(syncedCourse.sync_warnings);
    assert.isNotOk(syncedCourse.sync_errors);
  });

  it('syncs for known features as array', async () => {
    const courseData = util.getCourseData();
    courseData.course.options = {
      devModeFeatures: [sampleFeature1],
    };

    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedCourses = await util.dumpTableWithSchema('courses', CourseSchema);
    const syncedCourse = syncedCourses[0];
    assert.isNotOk(syncedCourse.sync_warnings);
    assert.isNotOk(syncedCourse.sync_errors);
  });

  it('adds a warning for an unknown feature', async () => {
    const courseData = util.getCourseData();
    courseData.course.options = {
      devModeFeatures: { [invalidFeature]: true },
    };

    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedCourses = await util.dumpTableWithSchema('courses', CourseSchema);
    const syncedCourse = syncedCourses[0];
    assert.isNotNull(syncedCourse.sync_warnings);
    assert.match(
      syncedCourse.sync_warnings,
      new RegExp(`Feature "${invalidFeature}" does not exist.`),
    );
    assert.isNotOk(syncedCourse.sync_errors);
  });

  it('adds a warning for a feature that is not enabled in non-dev environments', async () => {
    const originalDevMode = config.devMode;
    try {
      config.devMode = false;

      const courseData = util.getCourseData();
      courseData.course.options = {
        devModeFeatures: {
          [sampleFeature1]: true,
          [sampleFeature2]: true,
        },
      };

      const courseDir = await util.writeCourseToTempDirectory(courseData);

      // We need to create the course first so that we can enable a feature for it.
      const course = await selectOrInsertCourseByPath(courseDir);

      await features.enable(sampleFeature1, {
        institution_id: '1',
        course_id: course.id,
      });

      await util.syncCourseData(courseDir);

      const syncedCourses = await util.dumpTableWithSchema('courses', CourseSchema);
      const syncedCourse = syncedCourses[0];
      assert.isNotNull(syncedCourse.sync_warnings);
      assert.match(
        syncedCourse.sync_warnings,
        new RegExp(
          `Feature "${sampleFeature2}" is enabled in devModeFeatures, but is actually disabled.`,
        ),
      );
      assert.notMatch(syncedCourse.sync_warnings, new RegExp(sampleFeature1));
      assert.isNotOk(syncedCourse.sync_errors);
    } finally {
      config.devMode = originalDevMode;
    }
  });

  it('syncs string comments correctly', async () => {
    const courseData = util.getCourseData();
    courseData.course.comment = 'Course comment';
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedCourses = await util.dumpTableWithSchema('courses', CourseSchema);
    assert.lengthOf(syncedCourses, 1);
    assert.equal(syncedCourses[0].json_comment, 'Course comment');
  });

  it('syncs array comments correctly', async () => {
    const courseData = util.getCourseData();
    courseData.course.comment = ['Course comment 1', 'Course comment 2'];
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedCourses = await util.dumpTableWithSchema('courses', CourseSchema);
    assert.lengthOf(syncedCourses, 1);
    assert.deepEqual(syncedCourses[0].json_comment, ['Course comment 1', 'Course comment 2']);
  });

  it('syncs object comments correctly', async () => {
    const courseData = util.getCourseData();
    courseData.course.comment = { comment: 'Course comment', comment2: 'Course comment 2' };
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedCourses = await util.dumpTableWithSchema('courses', CourseSchema);
    assert.lengthOf(syncedCourses, 1);
    assert.deepEqual(syncedCourses[0].json_comment, {
      comment: 'Course comment',
      comment2: 'Course comment 2',
    });
  });

  it('records an error for invalid course element info files', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    const elementDir = path.join(courseDir, 'elements', 'invalid-element');
    await fs.ensureDir(elementDir);
    await fs.writeJSON(path.join(elementDir, 'info.json'), {
      controller: 42,
    });

    const syncResults = await util.syncCourseData(courseDir);

    assert.equal(syncResults.status, 'complete');
    assert.isTrue(syncResults.hadJsonErrors);

    const invalidElement = syncResults.courseData.courseElements['invalid-element'];
    assert.isDefined(invalidElement);
    const errors = invalidElement.errors.join('\n');
    assert.match(errors, /controller/);
    assert.notMatch(errors, /UUID is missing/);

    const output: string[] = [];
    writeErrorsAndWarningsForCourseData(syncResults.courseId, syncResults.courseData, (line = '') =>
      output.push(line),
    );
    const renderedOutput = output.join('\n');
    assert.match(renderedOutput, /elements\/invalid-element\/info\.json/);
    assert.match(renderedOutput, /controller/);
  });

  it('forbids sharing settings when sharing is not enabled', async () => {
    const courseData = util.getCourseData();
    courseData.course.sharingSets = [{ name: 'set1', description: 'Set 1' }];

    await withConfig({ checkSharingOnSync: true }, async () => {
      const courseDir = await util.writeCourseToTempDirectory(courseData);
      await util.syncCourseData(courseDir);
    });

    const syncedCourses = await util.dumpTableWithSchema('courses', CourseSchema);

    assert.lengthOf(syncedCourses, 1);
    const syncedCourse = syncedCourses[0];
    assert.isNotNull(syncedCourse.sync_errors);
    assert.match(syncedCourse.sync_errors, /"sharingSets" cannot be used/);
  });
});
