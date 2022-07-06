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

  it('adds a new module', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const newAssessmentModule = {
      name: 'New Module',
      heading: 'This is a new module',
    };
    courseData.course.assessmentModules.push(newAssessmentModule);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessmentModules = await util.dumpTable('assessment_modules');
    const syncedAssessmentModule = syncedAssessmentModules.find(
      (am) => am.name === newAssessmentModule.name
    );
    checkAssessmentModule(syncedAssessmentModule, newAssessmentModule);
  });
});
