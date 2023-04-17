// @ts-check
const { assert } = require('chai');

const helperDb = require('../helperDb');
const util = require('./util');

/**
 * Checks that the assessment set present in the database matches the data
 * from the original assessment set in `infoCourse.json`.
 *
 * @param {any} syncedAssessmentModule - The assessment set from the database
 * @param {any} assessmentModule - The assessment set from `infoCourse.json`.
 */
function checkAssessmentModule(syncedAssessmentModule, assessmentModule) {
  assert.isOk(syncedAssessmentModule);
  assert.equal(syncedAssessmentModule.name, assessmentModule.name);
  assert.equal(syncedAssessmentModule.heading, assessmentModule.heading);
}

describe('Assessment modules syncing', () => {
  before('set up testing database', helperDb.before);
  after('tear down testing database', helperDb.after);

  beforeEach('reset testing database', helperDb.resetDatabase);

  it('adds a new assessment module', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const newAssessmentModule = {
      name: 'New Module',
      heading: 'This is a new module',
    };
    courseData.course.assessmentModules?.push(newAssessmentModule);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessmentModules = await util.dumpTable('assessment_modules');
    const syncedAssessmentModule = syncedAssessmentModules.find(
      (am) => am.name === newAssessmentModule.name
    );
    checkAssessmentModule(syncedAssessmentModule, newAssessmentModule);
  });

  it('removes an assessment module', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const newAssessmentModule = {
      name: 'New Module',
      heading: 'This is a new module',
    };
    courseData.course.assessmentModules?.push(newAssessmentModule);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    courseData.course.assessmentModules?.pop();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessmentModules = await util.dumpTable('assessment_modules');
    const syncedAssessmentModule = syncedAssessmentModules.find(
      (am) => am.name === newAssessmentModule.name
    );
    assert.isUndefined(syncedAssessmentModule);
  });

  it('records a warning if two assessment modules have the same name', async () => {
    const courseData = util.getCourseData();
    const newAssessmentModule1 = {
      name: 'new assessment set',
      heading: 'new assessment module 1',
    };
    const newAssessmentModule2 = {
      name: 'new assessment set',
      heading: 'new assessment module 2',
    };
    courseData.course.assessmentModules?.push(newAssessmentModule1);
    courseData.course.assessmentModules?.push(newAssessmentModule2);
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessmentModules = await util.dumpTable('assessment_modules');
    const syncedAssessmentModule = syncedAssessmentModules.find(
      (as) => as.name === newAssessmentModule2.name
    );
    checkAssessmentModule(syncedAssessmentModule, newAssessmentModule2);
    const syncedCourses = await util.dumpTable('pl_courses');
    const syncedCourse = syncedCourses.find((c) => c.short_name === courseData.course.name);
    assert.match(syncedCourse?.sync_warnings, /Found duplicates in 'assessmentModules'/);
  });
});
