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
 * @returns {import('./util').Assessment}
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
    allowAccess: [],
  };
}

async function getSyncedAssessmentData(tid) {
  const res = await sqldb.queryOneRowAsync(sql.get_data_for_assessment, {tid});
  return res.rows[0];
}

async function findSyncedAssessment(tid) {
  const syncedAssessments = await util.dumpTable('assessments');
  return syncedAssessments.find(a => a.tid === tid);
}

describe('Assessment syncing', () => {
  // before('remove the template database', helperDb.dropTemplate);
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

    const syncedData = await getSyncedAssessmentData('newexam');

    assert.lengthOf(syncedData.zones, 2);
    assert.equal(syncedData.zones[0].title, 'zone 1');
    assert.equal(syncedData.zones[1].title, 'zone 2');

    assert.lengthOf(syncedData.alternative_groups, 2);

    assert.lengthOf(syncedData.assessment_questions, 2);
    assert.equal(syncedData.assessment_questions[0].question.qid, util.QUESTION_ID);
    assert.equal(syncedData.assessment_questions[1].question.qid, util.ALTERNATIVE_QUESTION_ID);
  });

  it('syncs a zone with alternatives', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones.push({
      title: 'zone 1',
      questions: [{
        points: 10,
        alternatives: [{
          id: util.QUESTION_ID,
        }, {
          id: util.ALTERNATIVE_QUESTION_ID,
          points: 5,
        }],
      }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('newexam');
    assert.lengthOf(syncedData.zones, 1);
    assert.lengthOf(syncedData.alternative_groups, 1);
    assert.lengthOf(syncedData.assessment_questions, 2);

    const firstAssessmentQuestion = syncedData.assessment_questions.find(aq => aq.question.qid === util.QUESTION_ID);
    assert.equal(firstAssessmentQuestion.max_points, 10);
    assert.deepEqual(firstAssessmentQuestion.points_list, [10]);

    const secondAssessmentQuestion = syncedData.assessment_questions.find(aq => aq.question.qid === util.ALTERNATIVE_QUESTION_ID);
    assert.equal(secondAssessmentQuestion.max_points, 5);
    assert.deepEqual(secondAssessmentQuestion.points_list, [5]);
  });

  it('reuses assessment questions when questions are removed and added again', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones = [{
      title: 'zone 1',
      questions: [{
        id: util.QUESTION_ID,
        points: 5,
      }, {
        id: util.ALTERNATIVE_QUESTION_ID,
        points: 10,
      }],
    }];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    const courseDir = await util.writeAndSyncCourseData(courseData);
    let syncedData = await getSyncedAssessmentData('newexam');
    const originalFirstSyncedAssessmentQuestion = syncedData.assessment_questions.find(aq => aq.question.qid === util.QUESTION_ID);
    const originalSecondSyncedAssessmentQuestion = syncedData.assessment_questions.find(aq => aq.question.qid === util.ALTERNATIVE_QUESTION_ID);

    const removedQuestion = assessment.zones[0].questions.shift();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedData = await getSyncedAssessmentData('newexam');
    const deletedFirstSyncedAssessmentQuestion = syncedData.assessment_questions.find(aq => aq.question.qid === util.QUESTION_ID);
    assert.isOk(deletedFirstSyncedAssessmentQuestion);
    assert.isNotNull(deletedFirstSyncedAssessmentQuestion.deleted_at);

    assessment.zones[0].questions.push(removedQuestion);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedData = await getSyncedAssessmentData('newexam');
    const newFirstSyncedAssessmentQuestion = syncedData.assessment_questions.find(aq => aq.question.qid === util.ALTERNATIVE_QUESTION_ID);
    const newSecondSyncedAssessmentQuestion = syncedData.assessment_questions.find(aq => aq.question.qid === util.QUESTION_ID);
    // The questions were reordered, but they should still have the same assessment question IDs
    assert.equal(newFirstSyncedAssessmentQuestion.id, originalSecondSyncedAssessmentQuestion.id);
    assert.equal(newSecondSyncedAssessmentQuestion.id, originalFirstSyncedAssessmentQuestion.id);
  });

  it('removes a zone from an assessment', async () => {
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

    const syncedData = await getSyncedAssessmentData('newexam');

    assert.lengthOf(syncedData.zones, 0);
    assert.lengthOf(syncedData.alternative_groups, 0);
    assert.lengthOf(syncedData.assessment_questions, 1);
    assert.isNotNull(syncedData.assessment_questions[0].deleted_at);
  });

  it('removes an access rule from an exam', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowAccess.push({
      mode: 'Exam',
      role: 'Student',
    }, {
      mode: 'Public',
      role: 'TA',
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    const courseDir = await util.writeAndSyncCourseData(courseData);
    const syncedAssessments = await util.dumpTable('assessments');
    const originalSyncedAssessment = syncedAssessments.find(a => a.tid === 'newexam');

    assessment.allowAccess.shift();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessmentAccessRules = await util.dumpTable('assessment_access_rules');
    const rulesForAssessment = syncedAssessmentAccessRules.filter(aar => aar.assessment_id === originalSyncedAssessment.id);
    assert.lengthOf(rulesForAssessment, 1);
    assert.equal(rulesForAssessment[0].role, 'TA');
    assert.equal(rulesForAssessment[0].mode, 'Public');
  });

  it('handles assessment sets that are not present in infoCourse.json', async () => {
    // Missing tags should be created
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    const missingAssessmentSetName = 'missing tag name';
    assessment.set = missingAssessmentSetName;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['new'] = assessment;
    const courseDir = await util.writeAndSyncCourseData(courseData);
    let syncedAssessmentSets = await util.dumpTable('assessment_sets');
    let syncedAssessmentSet = syncedAssessmentSets.find(aset => aset.name === missingAssessmentSetName);
    assert.isOk(syncedAssessmentSet);
    assert(syncedAssessmentSet.heading && syncedAssessmentSet.heading.length > 0, 'assessment set should not have empty heading');

    // When missing assessment sets are no longer used in any questions, they should
    // be removed from the DB
    assessment.set = 'Homework';
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedAssessmentSets = await util.dumpTable('assessment_sets');
    syncedAssessmentSet = syncedAssessmentSets.find(aset => aset.name === missingAssessmentSetName);
    assert.isUndefined(syncedAssessmentSet);
  });

  it('records an error if a question specifies neither an ID nor an alternative', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones.push({
      title: 'test zone',
      questions: [{}],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(syncedAssessment.sync_errors, /Zone question must specify either "alternatives" or "id"/);
  });

  it('records an error if a question specifies maxPoints on an Exam-type assessment', async () => {
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
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(syncedAssessment.sync_errors, /Cannot specify "maxPoints" for a question in an "Exam" assessment/);
  });

  it('records an error if a question does not specify points on an Exam-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    assessment.zones.push({
      title: 'test zone',
      questions: [{
        id: util.QUESTION_ID,
      }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(syncedAssessment.sync_errors, /Must specify "points" for a question in an "Exam" assessment/);
  });

  it('records an error if a question does not specify points on an Homework-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones.push({
      title: 'test zone',
      questions: [{
        id: util.QUESTION_ID,
      }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(syncedAssessment.sync_errors, /Must specify "maxPoints" for a question in a "Homework" assessment/);
  });

  it('records an error if a question specifies points as an array an Homework-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones.push({
      title: 'test zone',
      questions: [{
        id: util.QUESTION_ID,
        maxPoints: 10,
        points: [1,2,3],
      }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(syncedAssessment.sync_errors, /Cannot specify "points" as a list for a question in a "Homework" assessment/);
  });

  it('records an error if an assessment directory is missing an infoAssessment.json file', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'courseInstances', 'Fa19', 'assessments', 'fail'));
    await util.syncCourseData(courseDir);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(syncedAssessment.sync_errors, /Error reading JSON file courseInstances\/Fa19\/assessments\/fail\/infoAssessment.json: ENOENT/);
  });

  it('records an error if a zone references an invalid QID', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones.push({
      title: 'test zone',
      questions: [{
        id: 'i do not exist',
        points: [1,2,3],
      }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(syncedAssessment.sync_errors, /The following questions do not exist in this course: i do not exist/);
  });

  it('fails if an assessment references a QID more than once', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones.push({
      title: 'test zone',
      questions: [{
        id: util.QUESTION_ID,
        points: 5,
      }, {
        id: util.QUESTION_ID,
        points: 5,
      }],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(syncedAssessment.sync_errors, /The following questions are used more than once: test/);
  });

  it('records a warning if the same UUID is used multiple times in one course instance', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail1'] = assessment;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail2'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment1 = await findSyncedAssessment('fail1');
    assert.match(syncedAssessment1.sync_warnings, /UUID 1e0724c3-47af-4ca3-9188-5227ef0c5549 is used in other assessments in this course instance: fail2/);
    const syncedAssessment2 = await findSyncedAssessment('fail2');
    assert.match(syncedAssessment2.sync_warnings, /UUID 1e0724c3-47af-4ca3-9188-5227ef0c5549 is used in other assessments in this course instance: fail1/);
  });

  it('creates entry in database in the case of a missing UUID', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    delete assessment.uuid;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['missinguuid'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('missinguuid');
    assert.isOk(syncedAssessment);
  });

  it('updates old invalid data once a UUID is added', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    const oldUuid = assessment.uuid;
    delete assessment.uuid;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['missinguuid'] = assessment;
    const courseDir = await util.writeAndSyncCourseData(courseData);
    assessment.uuid = oldUuid;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessment = await findSyncedAssessment('missinguuid');
    assert.equal(syncedAssessment.title, assessment.title);
    assert.equal(syncedAssessment.uuid, oldUuid);
  });

  it.only('maintains identity via UUID when assessment is renamed', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['originalname'] = assessment;
    const courseDir = await util.writeAndSyncCourseData(courseData);
    const originalSyncedAssessment = await findSyncedAssessment('originalname');
    delete courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['originalname'];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newname'] = assessment;
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedAssessment = await findSyncedAssessment('newname');
    assert.equal(newSyncedAssessment.id, originalSyncedAssessment.id);
  });

  it.only('soft-deletes unused assessments', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['unused'] = assessment;
    const courseDir = await util.writeAndSyncCourseData(courseData);
    delete courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['unused'];
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessment = await findSyncedAssessment('unused');
    assert.isNotNull(syncedAssessment.deleted_at);
  });
});
