import { assert } from 'chai';
import * as util from './util';
import * as helperDb from '../helperDb';
import { config } from '../../lib/config';
import { features } from '../../lib/features';
import { selectOrInsertCourseByPath } from '../../models/course';

const [sampleFeature1, sampleFeature2] = features.allFeatures();
const invalidFeature = 'unknown-feature';

describe('Course syncing', () => {
  before('set up testing database', helperDb.before);
  after('tear down testing database', helperDb.after);

  beforeEach('reset testing database', helperDb.resetDatabase);

  it('syncs for known features', async () => {
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
      devModeFeatures: [invalidFeature],
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
        devModeFeatures: [sampleFeature1, sampleFeature2],
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
        new RegExp(`Feature "${sampleFeature2}" is not enabled for this course.`),
      );
      assert.notMatch(syncedCourse?.sync_warnings, new RegExp(sampleFeature1));
      assert.isNotOk(syncedCourse?.sync_errors);
    } finally {
      config.devMode = originalDevMode;
    }
  });
});
