const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const fs = require('fs-extra');
const path = require('path');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const util = require('./util');
const helperDb = require('../helperDb');

const sql = sqlLoader.loadSqlEquiv(__filename);
const { assert } = chai;

/**
 * Makes an empty assessment.
 * 
 * @param {import('./util').CourseData} courseData
 * @param {"Homework" | "Exam"} type
 */
function makeAssessment(courseData, type = 'Exam') {
  const assessmentSet = courseData.course.assessmentSets[0].name;
  return {
    uuid: '1e0724c3-47af-4ca3-9188-5227ef0c5549',
    type,
    title: 'Test assessment',
    set: assessmentSet,
    number: '1',
    zones: [],
  };
}

describe('Assessments syncing', () => {
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('adds a new zone to an assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones.push({
      title: 'zone 1',
      questions: [{ id: util.QUESTION_ID, points: 5 }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    const courseDir = await util.writeAndSyncCourseData(courseData);
    assessment.zones.push({
      title: 'zone 2',
      questions: [{ id: util.ALTERNATIVE_QUESTION_ID, points: 10 }],
    });
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    const syncedData = (await sqldb.queryOneRowAsync(sql.get_data_for_assessment, {tid: 'newexam'})).rows[0];

    assert.lengthOf(syncedData.zones, 2);
    assert.equal(syncedData.zones[0].title, 'zone 1');
    assert.equal(syncedData.zones[1].title, 'zone 2');

    assert.lengthOf(syncedData.alternative_groups, 2);

    assert.lengthOf(syncedData.assessment_questions, 2);
    assert.equal(syncedData.assessment_questions[0].question.qid, util.QUESTION_ID);
    assert.equal(syncedData.assessment_questions[1].question.qid, util.ALTERNATIVE_QUESTION_ID);
  });

  it.only('removes a zone from an assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones.push({
      title: 'zone 1',
      questions: [{ id: util.QUESTION_ID, points: 5 }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    const courseDir = await util.writeAndSyncCourseData(courseData);
    assessment.zones.pop();
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    const syncedData = (await sqldb.queryOneRowAsync(sql.get_data_for_assessment, {tid: 'newexam'})).rows[0];

    assert.lengthOf(syncedData.zones, 0);
    assert.lengthOf(syncedData.alternative_groups, 0);
    assert.lengthOf(syncedData.assessment_questions, 1);
    assert.isNotNull(syncedData.assessment_questions[0].deleted_at);
  });

  it('fails if an assessment uses a set that is not present in the course', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.set = 'not in the course';
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await assert.isRejected(util.syncCourseData(courseDir), /invalid/);
  });

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
