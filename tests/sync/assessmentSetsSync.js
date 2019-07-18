
const chai = require('chai');
const util = require('./util');
const helperDb = require('../helperDb');

const { assert } = chai;

/**
 * Checks that the assessment set present in the database matches the data
 * from the original assessment set in `infoCourse.json`.
 * 
 * @param {any} syncedAssessmentSet - The assessment set from the database
 * @param {any} assessmentSet - The assessment set from `infoCourse.json`.
 */
function checkAssessmentSet(syncedAssessmentSet, assessmentSet) {
  assert.isOk(syncedAssessmentSet);
  assert.equal(syncedAssessmentSet.name, assessmentSet.name);
  assert.equal(syncedAssessmentSet.abbreviation, assessmentSet.abbreviation);
  assert.equal(syncedAssessmentSet.heading, assessmentSet.heading);
  assert.equal(syncedAssessmentSet.color, assessmentSet.color);
}

function makeAssessmentSet() {
  return {
    name: 'new assessment set',
    abbreviation: 'new',
    heading: 'a new assessment set to sync',
    color: 'red1',
  };
}

describe('Assessment set syncing', () => {
  // use when changing sprocs
  // before('remove the template database', helperDb.dropTemplate);
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('adds a new assessment set', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const newAssessmentSet = makeAssessmentSet();
    courseData.course.assessmentSets.push(newAssessmentSet);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessmentSets = await util.dumpTable('assessment_sets');
    const syncedAssessmentSet = syncedAssessmentSets.find(as => as.name === newAssessmentSet.name);
    checkAssessmentSet(syncedAssessmentSet, newAssessmentSet);
  });

  it('removes an assessment set', async () => {
    const courseData = util.getCourseData();
    const oldAssessmentSet = makeAssessmentSet();
    courseData.course.assessmentSets.unshift(oldAssessmentSet);
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    courseData.course.assessmentSets.splice(0, 1);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessmentSets = await util.dumpTable('assessment_sets');
    const syncedAssessmentSet = syncedAssessmentSets.find(as => as.name === oldAssessmentSet.name);
    assert.isUndefined(syncedAssessmentSet);
  });

  it('renames an assessment set', async () => {
    const courseData = util.getCourseData();
    const oldAssessmentSet = makeAssessmentSet();
    courseData.course.assessmentSets.unshift(oldAssessmentSet);
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const oldName = courseData.course.assessmentSets[0].name;
    const newName = 'new name';
    courseData.course.assessmentSets[0].name = newName;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const dbAssessmentSets = await util.dumpTable('assessment_sets');
    assert.isUndefined(dbAssessmentSets.find(as => as.name === oldName));
    const dbAssessmentSet = dbAssessmentSets.find(as => as.name = newName);
    checkAssessmentSet(dbAssessmentSet, courseData.course.assessmentSets[0]);
  });
});
