import { assert } from 'chai';

import { config } from '../../lib/config.js';
import { features } from '../../lib/features/index.js';
import { selectOrInsertCourseByPath } from '../../models/course.js';
import * as helperDb from '../helperDb.js';

import * as util from './util.js';
import type { Course } from '../../lib/db-types.js';
import type { CourseJson, CourseJsonInput } from '../../schemas/infoCourse.js';
import { array } from 'zod';

const [sampleFeature1, sampleFeature2] = features.allFeatures();
const invalidFeature = 'unknown-feature';

describe('Course syncing', () => {
  before('set up testing database', helperDb.before);
  after('tear down testing database', helperDb.after);

  beforeEach('reset testing database', helperDb.resetDatabase);

  it('syncs for known features as object', async () => {
    const courseData = util.getCourseData();
    courseData.course.options = {
      useNewQuestionRenderer: true,
      devModeFeatures: { [sampleFeature1]: true },
    };

    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedCourses = await util.dumpTable('pl_courses');
    const syncedCourse = syncedCourses[0];
    assert.isNotOk(syncedCourse?.sync_warnings);
    assert.isNotOk(syncedCourse?.sync_errors);
  });

  it('syncs for known features as array', async () => {
    const courseData = util.getCourseData();
    courseData.course.options = {
      useNewQuestionRenderer: true,
      devModeFeatures: [sampleFeature1],
    };

    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedCourses = await util.dumpTable('pl_courses');
    const syncedCourse = syncedCourses[0];
    assert.isNotOk(syncedCourse?.sync_warnings);
    assert.isNotOk(syncedCourse?.sync_errors);
  });

  it('adds a warning for an unknown feature', async () => {
    const courseData = util.getCourseData();
    courseData.course.options = {
      useNewQuestionRenderer: true,
      devModeFeatures: { [invalidFeature]: true },
    };

    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedCourses = await util.dumpTable('pl_courses');
    const syncedCourse = syncedCourses[0];
    assert.match(
      syncedCourse?.sync_warnings,
      new RegExp(`Feature "${invalidFeature}" does not exist.`),
    );
    assert.isNotOk(syncedCourse?.sync_errors);
  });

  it('adds a warning for a feature that is not enabled in non-dev environments', async () => {
    const originalDevMode = config.devMode;
    try {
      config.devMode = false;

      const courseData = util.getCourseData();
      courseData.course.options = {
        useNewQuestionRenderer: true,
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

      const syncedCourses = await util.dumpTable('pl_courses');
      const syncedCourse = syncedCourses[0];
      assert.match(
        syncedCourse?.sync_warnings,
        new RegExp(
          `Feature "${sampleFeature2}" is enabled in devModeFeatures, but is actually disabled.`,
        ),
      );
      assert.notMatch(syncedCourse?.sync_warnings, new RegExp(sampleFeature1));
      assert.isNotOk(syncedCourse?.sync_errors);
    } finally {
      config.devMode = originalDevMode;
    }
  });

  it('syncs JSON comments correctly', async () => {
    const courseData = util.getCourseData();
    courseData.course.comment = 'Course comment';
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const arrayCommentCourseData = courseData;
    arrayCommentCourseData.course.uuid = '03fbaa19-69c5-41a9-922c-712136777781';
    arrayCommentCourseData.course.title = 'Course with array comment';
    arrayCommentCourseData.course.comment = ['comment 1', 'comment 2'];
    const arrayCommentCourseDir = await util.writeCourseToTempDirectory(arrayCommentCourseData);
    await util.syncCourseData(arrayCommentCourseDir);
    const objectCommentCourseData = courseData;
    arrayCommentCourseData.course.uuid = '96e305e2-a149-4342-8d4c-172c010b45f9';
    arrayCommentCourseData.course.title = 'Course with object comment';
    objectCommentCourseData.course.comment = {
      comment1: 'comment 1',
      comment2: 'comment 2',
    };
    const objectCommentCourseDir = await util.writeCourseToTempDirectory(objectCommentCourseData);
    await util.syncCourseData(objectCommentCourseDir);
    const syncedCourses = await util.dumpTable('pl_courses');
    assert.lengthOf(syncedCourses, 3);
    assert.equal(syncedCourses[0].json_comment, 'Course comment');
    assert.deepEqual(syncedCourses[1].json_comment, ['comment 1', 'comment 2']);
    assert.deepEqual(syncedCourses[2].json_comment, {
      comment1: 'comment 1',
      comment2: 'comment 2',
    });
  });
});
