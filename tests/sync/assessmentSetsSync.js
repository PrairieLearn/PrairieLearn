
const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const util = require('./util');
const helperDb = require('../helperDb');

const { assert } = chai;

describe('Assessment set syncing', () => {
  before('wig', helperDb.dropTemplate);
  beforeEach('set up testing database', helperDb.before);
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
    const assessmentSets = await util.dumpTable('assessment_sets');
    const assessmentSet = assessmentSets.find(as => as.name === newAssessmentSet.name);
    assert.isOk(assessmentSet);
    assert.equal(assessmentSet.name, newAssessmentSet.name);
    assert.equal(assessmentSet.abbreviation, newAssessmentSet.abbreviation);
    assert.equal(assessmentSet.description, newAssessmentSet.description);
    assert.equal(assessmentSet.color, newAssessmentSet.color);
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
});
