import { assert } from 'chai';
import * as util from './util';
import * as helperDb from '../helperDb';
import { config } from '../../lib/config';
import { features } from '../../lib/features';
import { callRow } from '@prairielearn/postgres';
import { IdSchema } from '../../lib/db-types';

describe('Course syncing', () => {
  before('set up testing database', helperDb.before);
  after('tear down testing database', helperDb.after);

  beforeEach('reset testing database', helperDb.resetDatabase);

  it('syncs for known features', async () => {
    const courseData = util.getCourseData();
    courseData.course.options = {
      useNewQuestionRenderer: true,
      devModeFeatures: ['manual-grading-rubrics'],
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
      devModeFeatures: ['unknown-feature'],
    };

    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedCourses = await util.dumpTable('pl_courses');
    const syncedCourse = syncedCourses[0];
    assert.match(syncedCourse?.sync_warnings, /Feature "unknown-feature" does not exist./);
    assert.isNotOk(syncedCourse?.sync_errors);
  });

  it('adds a warning for a feature that is not enabled in non-dev environments', async () => {
    const originalDevMode = config.devMode;
    try {
      config.devMode = false;

      const courseData = util.getCourseData();
      courseData.course.options = {
        useNewQuestionRenderer: true,
        devModeFeatures: ['manual-grading-rubrics', 'course-instance-billing'],
      };

      const courseDir = await util.writeCourseToTempDirectory(courseData);

      // We need to create the course first so that we can enable a feature for it.
      const course_id = await callRow('select_or_insert_course_by_path', [courseDir], IdSchema);

      await features.enable('manual-grading-rubrics', {
        institution_id: '1',
        course_id,
      });

      await util.syncCourseData(courseDir);

      const syncedCourses = await util.dumpTable('pl_courses');
      const syncedCourse = syncedCourses[0];
      assert.match(
        syncedCourse?.sync_warnings,
        /Feature "course-instance-billing" is not enabled for this course./,
      );
      assert.notMatch(syncedCourse?.sync_warnings, /manual-grading-rubrics/);
      assert.isNotOk(syncedCourse?.sync_errors);
    } finally {
      config.devMode = originalDevMode;
    }
  });
});
