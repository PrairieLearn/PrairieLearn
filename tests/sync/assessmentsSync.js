const chaiAsPromised = require('chai-as-promised');
const chai = require('chai');
chai.use(chaiAsPromised);
const fs = require('fs-extra');
const path = require('path');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const { idsEqual } = require('../../lib/id');

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

/**
 * Makes a new assessment.
 *
 * @returns {import('./util').AssessmentSet}
 */
function makeAssessmentSet() {
  return {
    name: 'new assessment set',
    abbreviation: 'new',
    heading: 'a new assessment set to sync',
    color: 'red1',
  };
}

async function getSyncedAssessmentData(tid) {
  const res = await sqldb.queryOneRowAsync(sql.get_data_for_assessment, {
    tid,
  });
  return res.rows[0];
}

async function findSyncedAssessment(tid) {
  const syncedAssessments = await util.dumpTable('assessments');
  return syncedAssessments.find((a) => a.tid === tid);
}

async function findSyncedUndeletedAssessment(tid) {
  const syncedAssessments = await util.dumpTable('assessments');
  return syncedAssessments.find((a) => a.tid === tid && a.deleted_at == null);
}

describe('Assessment syncing', () => {
  // Uncomment whenever you change relevant sprocs or migrations
  // before('remove the template database', helperDb.dropTemplate);
  beforeEach('set up testing database', helperDb.before);
  afterEach('tear down testing database', helperDb.after);

  it('allows nesting of assessments in subfolders', async () => {
    const courseData = util.getCourseData();
    const nestedAssessmentStructure = ['subfolder1', 'subfolder2', 'subfolder3', 'nestedQuestion'];
    const assessmentId = nestedAssessmentStructure.join('/');
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[assessmentId] =
      makeAssessment(courseData);
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);

    const syncedData = await findSyncedAssessment(assessmentId);
    assert.isOk(syncedData);
  });

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

  it('syncs alternatives in an Exam zone', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    assessment.zones.push({
      title: 'zone 1',
      questions: [
        {
          points: 10,
          alternatives: [
            {
              id: util.QUESTION_ID,
            },
            {
              id: util.ALTERNATIVE_QUESTION_ID,
              points: 5,
            },
          ],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('newexam');
    assert.lengthOf(syncedData.zones, 1);
    assert.lengthOf(syncedData.alternative_groups, 1);
    assert.lengthOf(syncedData.assessment_questions, 2);

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID
    );
    assert.equal(firstAssessmentQuestion.max_points, 10);
    assert.deepEqual(firstAssessmentQuestion.points_list, [10]);

    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID
    );
    assert.equal(secondAssessmentQuestion.max_points, 5);
    assert.deepEqual(secondAssessmentQuestion.points_list, [5]);
  });

  it('syncs alternatives in a Homework zone', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones.push({
      title: 'zone 1',
      questions: [
        {
          maxPoints: 20,
          points: 10,
          alternatives: [
            {
              id: util.QUESTION_ID,
            },
            {
              id: util.ALTERNATIVE_QUESTION_ID,
              maxPoints: 15,
              points: 5,
            },
          ],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    await util.writeAndSyncCourseData(courseData);

    const syncedData = await getSyncedAssessmentData('newexam');
    assert.lengthOf(syncedData.zones, 1);
    assert.lengthOf(syncedData.alternative_groups, 1);
    assert.lengthOf(syncedData.assessment_questions, 2);

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID
    );
    assert.equal(firstAssessmentQuestion.init_points, 10);
    assert.equal(firstAssessmentQuestion.max_points, 20);

    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID
    );
    assert.equal(secondAssessmentQuestion.init_points, 5);
    assert.equal(secondAssessmentQuestion.max_points, 15);
  });

  it('reuses assessment questions when questions are removed and added again', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones = [
      {
        title: 'zone 1',
        questions: [
          {
            id: util.QUESTION_ID,
            points: 5,
          },
          {
            id: util.ALTERNATIVE_QUESTION_ID,
            points: 10,
          },
        ],
      },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    const courseDir = await util.writeAndSyncCourseData(courseData);
    let syncedData = await getSyncedAssessmentData('newexam');
    const originalFirstSyncedAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID
    );
    const originalSecondSyncedAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID
    );

    const removedQuestion = assessment.zones[0].questions.shift();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedData = await getSyncedAssessmentData('newexam');
    const deletedFirstSyncedAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID
    );
    assert.isOk(deletedFirstSyncedAssessmentQuestion);
    assert.isNotNull(deletedFirstSyncedAssessmentQuestion.deleted_at);

    assessment.zones[0].questions.push(removedQuestion);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedData = await getSyncedAssessmentData('newexam');
    const newFirstSyncedAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID
    );
    const newSecondSyncedAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID
    );
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
    assessment.allowAccess.push(
      {
        mode: 'Exam',
      },
      {
        mode: 'Public',
      }
    );
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    const courseDir = await util.writeAndSyncCourseData(courseData);
    const syncedAssessments = await util.dumpTable('assessments');
    const originalSyncedAssessment = syncedAssessments.find((a) => a.tid === 'newexam');

    assessment.allowAccess.shift();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessmentAccessRules = await util.dumpTable('assessment_access_rules');
    const rulesForAssessment = syncedAssessmentAccessRules.filter((aar) =>
      idsEqual(aar.assessment_id, originalSyncedAssessment.id)
    );
    assert.lengthOf(rulesForAssessment, 1);
    assert.equal(rulesForAssessment[0].mode, 'Public');
  });

  it('syncs empty arrays correctly', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    // NOTE: our JSON schema explicitly prohibits a zone question from having
    // an empty points array, so we can't test that here as it's impossible
    // for it to ever be written to the database.
    assessment.allowAccess.push({
      mode: 'Exam',
      uids: [],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['newexam'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessments = await util.dumpTable('assessments');
    const syncedAssessment = syncedAssessments.find((a) => a.tid === 'newexam');

    const assessmentAccessRules = await util.dumpTable('assessment_access_rules');
    const assessmentAccessRule = assessmentAccessRules.find((aar) =>
      idsEqual(aar.assessment_id, syncedAssessment.id)
    );
    const { uids } = assessmentAccessRule;
    assert.isArray(uids, 'uids should be an array');
    assert.isEmpty(uids, 'uids should be empty');
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
    let syncedAssessmentSet = syncedAssessmentSets.find(
      (aset) => aset.name === missingAssessmentSetName
    );
    assert.isOk(syncedAssessmentSet);
    assert(
      syncedAssessmentSet.heading && syncedAssessmentSet.heading.length > 0,
      'assessment set should not have empty heading'
    );

    // When missing assessment sets are no longer used in any questions, they should
    // be removed from the DB
    assessment.set = 'Homework';
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    syncedAssessmentSets = await util.dumpTable('assessment_sets');
    syncedAssessmentSet = syncedAssessmentSets.find(
      (aset) => aset.name === missingAssessmentSetName
    );
    assert.isUndefined(syncedAssessmentSet);
  });

  it('records an error if an access rule end date is before the start date', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowAccess.push({
      startDate: '2020-01-01T11:11:11',
      endDate: '2019-01-01T00:00:00',
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment.sync_errors,
      /Invalid allowAccess rule: startDate \(2020-01-01T11:11:11\) must not be after endDate \(2019-01-01T00:00:00\)/
    );
  });

  it('records an error if an access rule start date is invalid', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowAccess.push({
      startDate: 'not a valid date',
      endDate: '2019-01-01T00:00:00',
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment.sync_errors,
      /Invalid allowAccess rule: startDate \(not a valid date\) is not valid/
    );
  });

  it('records an error if an access rule end date is invalid', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowAccess.push({
      startDate: '2020-01-01T11:11:11',
      endDate: 'not a valid date',
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment.sync_errors,
      /Invalid allowAccess rule: endDate \(not a valid date\) is not valid/
    );
  });

  it('records an error if an access rule sets active to false and has nonzero credit', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowAccess.push({
      credit: 100,
      active: false,
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment.sync_errors,
      /Invalid allowAccess rule: credit must be 0 if active is false/
    );
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
    assert.match(
      syncedAssessment.sync_errors,
      /Zone question must specify either "alternatives" or "id"/
    );
  });

  it('records an error if a question specifies maxPoints on an Exam-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    assessment.zones.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          maxPoints: 5,
          points: 5,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment.sync_errors,
      /Cannot specify "maxPoints" for a question in an "Exam" assessment/
    );
  });

  it('records an error if a question does not specify points on an Exam-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Exam');
    assessment.zones.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment.sync_errors,
      /Must specify "points" for a question in an "Exam" assessment/
    );
  });

  it('records an error if a question does not specify points on an Homework-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment.sync_errors,
      /Must specify "points" for a question in a "Homework" assessment/
    );
  });

  it('records an error if a question specifies points as an array an Homework-type assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.zones.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          maxPoints: 10,
          points: [1, 2, 3],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment.sync_errors,
      /Cannot specify "points" as a list for a question in a "Homework" assessment/
    );
  });

  it('records an error if an assessment directory is missing an infoAssessment.json file', async () => {
    const courseData = util.getCourseData();
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(path.join(courseDir, 'courseInstances', 'Fa19', 'assessments', 'fail'));
    await util.syncCourseData(courseDir);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.isOk(syncedAssessment);
    assert.match(
      syncedAssessment.sync_errors,
      /Missing JSON file: courseInstances\/Fa19\/assessments\/fail\/infoAssessment.json/
    );
  });

  it('records an error if a zone references an invalid QID', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones.push({
      title: 'test zone',
      questions: [
        {
          id: 'i do not exist',
          points: [1, 2, 3],
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment.sync_errors,
      /The following questions do not exist in this course: i do not exist/
    );
  });

  it('records an error if an assessment references a QID more than once', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.zones.push({
      title: 'test zone',
      questions: [
        {
          id: util.QUESTION_ID,
          points: 5,
        },
        {
          id: util.QUESTION_ID,
          points: 5,
        },
      ],
    });
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment.sync_errors,
      /The following questions are used more than once: test/
    );
  });

  it('records an error if real-time grading is disallowed on a homework assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData, 'Homework');
    assessment.allowRealTimeGrading = false;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment.sync_errors,
      /Real-time grading cannot be disabled for Homework-type assessments/
    );
  });

  it('records an error if multiple-element points array is specified for a question when real-time grading is disallowed', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowRealTimeGrading = false;
    assessment.zones = [
      {
        title: 'zone 1',
        questions: [
          {
            id: util.QUESTION_ID,
            points: [5, 4, 3],
          },
          {
            id: util.ALTERNATIVE_QUESTION_ID,
            points: [10, 9, 8],
          },
        ],
      },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment.sync_errors,
      /Cannot specify an array of multiple point values for a question/
    );
  });

  it('accepts a single-element points array being specified for a question when real-time grading is disallowed', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowRealTimeGrading = false;
    assessment.zones = [
      {
        title: 'zone 1',
        questions: [
          {
            id: util.QUESTION_ID,
            points: [5],
          },
          {
            id: util.ALTERNATIVE_QUESTION_ID,
            points: [10],
          },
        ],
      },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['points_array_size_one'] =
      assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedData = await getSyncedAssessmentData('points_array_size_one');

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID
    );
    assert.deepEqual(firstAssessmentQuestion.points_list, [5]);

    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID
    );
    assert.deepEqual(secondAssessmentQuestion.points_list, [10]);

    const syncedAssessment = await findSyncedAssessment('points_array_size_one');
    assert.equal(syncedAssessment.sync_errors, null);
  });

  it('records an error if multiple-element points array is specified for an alternative when real-time grading is disallowed', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowRealTimeGrading = false;
    assessment.zones = [
      {
        title: 'zone 1',
        questions: [
          {
            points: [10, 9, 8],
            alternatives: [
              {
                id: util.QUESTION_ID,
              },
              {
                id: util.ALTERNATIVE_QUESTION_ID,
                points: [5, 4, 3],
              },
            ],
          },
        ],
      },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.match(
      syncedAssessment.sync_errors,
      /Cannot specify an array of multiple point values for an alternative/
    );
  });

  it('accepts a single-element points array being specified for an alternative when real-time grading is disallowed', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    assessment.allowRealTimeGrading = false;
    assessment.zones = [
      {
        title: 'zone 1',
        questions: [
          {
            points: [10],
            alternatives: [
              {
                id: util.QUESTION_ID,
              },
              {
                id: util.ALTERNATIVE_QUESTION_ID,
                points: [5],
              },
            ],
          },
        ],
      },
    ];
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['points_array_size_one'] =
      assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedData = await getSyncedAssessmentData('points_array_size_one');

    const firstAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.QUESTION_ID
    );
    assert.deepEqual(firstAssessmentQuestion.points_list, [10]);

    const secondAssessmentQuestion = syncedData.assessment_questions.find(
      (aq) => aq.question.qid === util.ALTERNATIVE_QUESTION_ID
    );
    assert.deepEqual(secondAssessmentQuestion.points_list, [5]);

    const syncedAssessment = await findSyncedAssessment('points_array_size_one');
    assert.equal(syncedAssessment.sync_errors, null);
  });

  it('records a warning if the same UUID is used multiple times in one course instance', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail1'] = assessment;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail2'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessment1 = await findSyncedAssessment('fail1');
    assert.match(
      syncedAssessment1.sync_warnings,
      /UUID "1e0724c3-47af-4ca3-9188-5227ef0c5549" is used in other assessments in this course instance: fail2/
    );
    const syncedAssessment2 = await findSyncedAssessment('fail2');
    assert.match(
      syncedAssessment2.sync_warnings,
      /UUID "1e0724c3-47af-4ca3-9188-5227ef0c5549" is used in other assessments in this course instance: fail1/
    );
  });

  it('creates entry in the database in the case of invalid JSON', async () => {
    const courseData = util.getCourseData();
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['fail'] = 'lol not valid json';
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessmentSets = await util.dumpTable('assessment_sets');
    const unknownAssessmentSet = syncedAssessmentSets.find((as) => as.name === 'Unknown');
    const syncedAssessment = await findSyncedAssessment('fail');
    assert.isOk(syncedAssessment);
    assert.equal(syncedAssessment.assessment_set_id, unknownAssessmentSet.id);
    assert.equal(syncedAssessment.number, '0');
  });

  it('creates entry in database in the case of a missing UUID', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    delete assessment.uuid;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['missinguuid'] = assessment;
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessmentSets = await util.dumpTable('assessment_sets');
    const unknownAssessmentSet = syncedAssessmentSets.find((as) => as.name === 'Unknown');
    const syncedAssessment = await findSyncedAssessment('missinguuid');
    assert.isOk(syncedAssessment);
    assert.equal(syncedAssessment.assessment_set_id, unknownAssessmentSet.id);
    assert.equal(syncedAssessment.number, '0');
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

  it('maintains identity via UUID when assessment is renamed', async () => {
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

  it('soft-deletes unused assessments', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['unused'] = assessment;
    const courseDir = await util.writeAndSyncCourseData(courseData);
    delete courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['unused'];
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessment = await findSyncedAssessment('unused');
    assert.isNotNull(syncedAssessment.deleted_at);
  });

  it('preserves assessment despite deletion of the assessment set', async () => {
    const courseData = util.getCourseData();
    const assessmentSet = makeAssessmentSet();
    courseData.course.assessmentSets.push(assessmentSet);
    const assessment = makeAssessment(courseData);
    assessment.set = assessmentSet.name;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['testAssessment'] = assessment;
    const courseDir = await util.writeAndSyncCourseData(courseData);
    const originalSyncedAssessment = await findSyncedAssessment('testAssessment');

    // now delete the assessment set, but leave the assessment in place
    courseData.course.assessmentSets.pop();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const newSyncedAssessment = await findSyncedAssessment('testAssessment');
    assert.equal(newSyncedAssessment.id, originalSyncedAssessment.id);

    // check we have a valid auto-created assessment set
    const syncedAssessmentSets = await util.dumpTable('assessment_sets');
    const syncedAssessmentSet = syncedAssessmentSets.find((as) => as.name === assessmentSet.name);
    assert.equal(newSyncedAssessment.assessment_set_id, syncedAssessmentSet.id);
  });

  it('correctly handles a new assessment with the same TID as a deleted assessment', async () => {
    const courseData = util.getCourseData();
    const assessment = makeAssessment(courseData);
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['testAssessment'] = assessment;
    const courseDir = await util.writeAndSyncCourseData(courseData);

    // now change the UUID of the assessment and re-sync
    assessment.uuid = '98c427af-1216-47ad-b982-6e88974080e1';
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessment = await findSyncedUndeletedAssessment('testAssessment');
    assert.equal(syncedAssessment.uuid, assessment.uuid);
  });

  it('does not add errors to deleted assessments', async () => {
    const courseData = util.getCourseData();
    const originalAssessment = makeAssessment(courseData);
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['repeatedAssessment'] =
      originalAssessment;
    const courseDir = await util.writeAndSyncCourseData(courseData);

    // now change the UUID of the assessment, add an error and re-sync
    const newAssessment = { ...originalAssessment };
    newAssessment.uuid = '49c8b795-dfde-4c13-a040-0fd1ba711dc5';
    delete newAssessment.title; // will make the assessment broken
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['repeatedAssessment'] =
      newAssessment;
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    // check that the newly-synced assessment has an error
    const syncedAssessments = await util.dumpTable('assessments');
    const syncedAssessment = syncedAssessments.find(
      (a) => a.tid === 'repeatedAssessment' && a.deleted_at == null
    );
    assert.equal(syncedAssessment.uuid, newAssessment.uuid);
    assert.match(syncedAssessment.sync_errors, /should have required property 'title'/);

    // check that the old deleted assessment does not have any errors
    const deletedAssessment = syncedAssessments.find(
      (a) => a.tid === 'repeatedAssessment' && a.deleted_at != null
    );
    assert.equal(deletedAssessment.uuid, originalAssessment.uuid);
    assert.equal(deletedAssessment.sync_errors, null);
  });

  it('records an error if a nested assessment directory does not eventually contain an infoAssessment.json file', async () => {
    const courseData = util.getCourseData();
    const nestedAssessmentStructure = [
      'subfolder1',
      'subfolder2',
      'subfolder3',
      'nestedAssessment',
    ];
    const assessmentId = nestedAssessmentStructure.join('/');
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await fs.ensureDir(
      path.join(
        courseDir,
        'courseInstances',
        util.COURSE_INSTANCE_ID,
        'assessments',
        ...nestedAssessmentStructure
      )
    );
    await util.syncCourseData(courseDir);

    const syncedAssessment = await findSyncedAssessment(assessmentId);
    assert.isOk(syncedAssessment);
    assert.match(
      syncedAssessment.sync_errors,
      new RegExp(
        `Missing JSON file: courseInstances/${util.COURSE_INSTANCE_ID}/assessments/subfolder1/subfolder2/subfolder3/nestedAssessment/infoAssessment.json`
      )
    );

    // We should only record an error for the most deeply nested directories,
    // not any of the intermediate ones.
    for (let i = 0; i < nestedAssessmentStructure.length - 1; i++) {
      const partialNestedAssessmentStructure = nestedAssessmentStructure.slice(0, i);
      const partialAssessmentId = partialNestedAssessmentStructure.join('/');

      const syncedAssessment = await findSyncedAssessment(partialAssessmentId);
      assert.isUndefined(syncedAssessment);
    }
  });
});
