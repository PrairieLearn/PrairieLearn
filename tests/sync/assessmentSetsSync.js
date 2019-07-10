
const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const util = require('./util');
const helperDb = require('../helperDb');

const { assert } = chai;

function checkAssessmentSet(fromDb, original) {
  assert.isOk(fromDb);
  assert.equal(fromDb.name, original.name);
  assert.equal(fromDb.abbreviation, original.abbreviation);
  assert.equal(fromDb.heading, original.heading);
  assert.equal(fromDb.color, original.color);
}

describe('Assessment set syncing', () => {
  before('wig', helperDb.dropTemplate);
  // use when changing sprocs
  // before('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('adds a new assessment set', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const newAssessmentSet = {
      name: 'new assessment set',
      abbreviation: 'new',
      heading: 'a new assessment set to sync',
      color: 'red1',
    };
    courseData.course.assessmentSets.push(newAssessmentSet);
    await util.writeAndSyncCourseData(courseData, courseDir);
    const dbAssessmentSets = await util.dumpTable('assessment_sets');
    const dbAssessmentSet = dbAssessmentSets.find(as => as.name === newAssessmentSet.name);
    checkAssessmentSet(dbAssessmentSet, newAssessmentSet);
  });

  it('removes an assessment set', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const oldAssessmentSet = courseData.course.assessmentSets[0];
    courseData.course.assessmentSets.splice(0, 1);
    await util.writeAndSyncCourseData(courseData, courseDir);
    const assessmentSets = await util.dumpTable('assessment_sets');
    const assessmentSet = assessmentSets.find(as => as.name === oldAssessmentSet.name);
    assert.isUndefined(assessmentSet);
  });

  it('renames an assessment set', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const oldName = courseData.course.assessmentSets[0].name;
    const newName = 'new name';
    courseData.course.assessmentSets[0].name = newName;
    await util.writeAndSyncCourseData(courseData, courseDir);
    const dbAssessmentSets = await util.dumpTable('assessment_sets');
    assert.isUndefined(dbAssessmentSets.find(as => as.name === oldName));
    const dbAssessmentSet = dbAssessmentSets.find(as => as.name = newName);
    checkAssessmentSet(dbAssessmentSet, courseData.course.assessmentSets[0]);
  });
});
