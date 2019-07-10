const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const fs = require('fs-extra');
const path = require('path');
const util = require('./util');
const helperDb = require('../helperDb');

const { assert } = chai;

/**
 * Makes an empty assessment.
 * 
 * @param {import('./util').CourseData} courseData
 * @param {"Homework" | "Exam"} type
 */
function makeAssessment(courseData, type = 'Exam') {
  const assessmentSet = courseData.course.assessmentSets[0].name;
  const assessment = {
    uuid: '1e0724c3-47af-4ca3-9188-5227ef0c5549',
    type,
    title: 'Test assessment',
    set: assessmentSet,
    number: '1',
    zones: [],
  };
  return JSON.parse(JSON.stringify(assessment));
}

describe('Assessments syncing', () => {
  // use when changing sprocs
  // before('remove the template database', helperDb.dropTemplate);
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('fails if a question specifies neither an ID nor an alternative', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones.push({
      title: 'test zone',
      questions: [{}],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await assert.isRejected(util.syncCourseData(courseDir), /Must specify either/);
  });

  it('fails if a question specifies maxPoints on an Exam-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    assessment.zones.push({
      title: 'test zone',
      questions: [{
        id: util.QUESTION_ID,
        maxPoints: 5,
        points: 5,
      }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await assert.isRejected(util.syncCourseData(courseDir), /Cannot specify/);
  });

  it('fails if a question does not specify points on an Exam-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    assessment.zones.push({
      title: 'test zone',
      questions: [{
        id: util.QUESTION_ID,
      }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await assert.isRejected(util.syncCourseData(courseDir), /Must specify/);
  });

  it('fails if a question does not specify points on an Homework-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones.push({
      title: 'test zone',
      questions: [{
        id: util.QUESTION_ID,
      }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await assert.isRejected(util.syncCourseData(courseDir), /Must specify/);
  });

  it('fails if a question specifies points as an array an Homework-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones.push({
      title: 'test zone',
      questions: [{
        id: util.QUESTION_ID,
        points: [1,2,3],
      }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await assert.isRejected(util.syncCourseData(courseDir), /Cannot specify/);
  });

  it('fails if an assessment directory is missing an infoAssessment.json file', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'courseInstances', 'Fa19', 'assessments', 'badAssessment'));
    await assert.isRejected(util.syncCourseData(courseDir), /ENOENT/);
  });
});
