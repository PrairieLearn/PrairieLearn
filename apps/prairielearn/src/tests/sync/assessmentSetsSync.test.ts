import { assert } from 'chai';

import * as helperDb from '../helperDb.js';

import * as util from './util.js';

/**
 * Checks that the assessment set present in the database matches the data
 * from the original assessment set in `infoCourse.json`.
 *
 * @param syncedAssessmentSet - The assessment set from the database
 * @param assessmentSet - The assessment set from `infoCourse.json`.
 */
function checkAssessmentSet(syncedAssessmentSet: any, assessmentSet: any) {
  assert.isOk(syncedAssessmentSet);
  assert.equal(syncedAssessmentSet.name, assessmentSet.name);
  assert.equal(syncedAssessmentSet.abbreviation, assessmentSet.abbreviation);
  assert.equal(syncedAssessmentSet.heading, assessmentSet.heading);
  assert.equal(syncedAssessmentSet.color, assessmentSet.color);
}

/**
 * Makes a new assessment.
 */
function makeAssessmentSet(): util.AssessmentSet {
  return {
    name: 'new assessment set',
    abbreviation: 'new',
    heading: 'a new assessment set to sync',
    color: 'red1',
  };
}

describe('Assessment set syncing', () => {
  before('set up testing database', helperDb.before);
  after('tear down testing database', helperDb.after);

  beforeEach('reset testing database', helperDb.resetDatabase);

  it('adds a new assessment set', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const newAssessmentSet = makeAssessmentSet();
    courseData.course.assessmentSets.push(newAssessmentSet);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessmentSets = await util.dumpTable('assessment_sets');
    const syncedAssessmentSet = syncedAssessmentSets.find(
      (as) => as.name === newAssessmentSet.name,
    );
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
    const syncedAssessmentSet = syncedAssessmentSets.find(
      (as) => as.name === oldAssessmentSet.name,
    );
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
    assert.isUndefined(dbAssessmentSets.find((as) => as.name === oldName));
    const dbAssessmentSet = dbAssessmentSets.find((as) => (as.name = newName));
    checkAssessmentSet(dbAssessmentSet, courseData.course.assessmentSets[0]);
  });

  it('records a warning if two assessment sets have the same name', async () => {
    const courseData = util.getCourseData();
    const newAssessmentSet1 = {
      name: 'new assessment set',
      abbreviation: 'new1',
      heading: 'a new assessment set 1 to sync',
      color: 'red1',
    };
    const newAssessmentSet2 = {
      name: 'new assessment set',
      abbreviation: 'new2',
      heading: 'a new assessment set 2 to sync',
      color: 'red2',
    };
    courseData.course.assessmentSets.push(newAssessmentSet1);
    courseData.course.assessmentSets.push(newAssessmentSet2);
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessmentSets = await util.dumpTable('assessment_sets');
    const syncedAssessmentSet = syncedAssessmentSets.find(
      (as) => as.name === newAssessmentSet1.name,
    );
    checkAssessmentSet(syncedAssessmentSet, newAssessmentSet2);
    const syncedCourses = await util.dumpTable('pl_courses');
    const syncedCourse = syncedCourses.find((c) => c.short_name === courseData.course.name);
    assert.match(syncedCourse?.sync_warnings, /Found duplicates in 'assessmentSets'/);
  });

  it('adds default assessment sets if used by assessments but not specified in courseData', async () => {
    const courseData = util.getCourseData();

    // Similarly, the Machine Problem set is in DEFAULT_ASSESSMENT_SETS but not in courseData
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[util.ASSESSMENT_ID]['set'] =
      'Machine Problem';

    const newAssessment: util.Assessment = {
      uuid: '03f3b4d2-0264-48b7-bf42-107732142c01',
      title: 'Test assessment 2',
      type: 'Exam',
      set: 'Worksheet', // The Worksheet set is in DEFAULT_ASSESSMENT_SETS but not in courseData
      number: '101',
    };
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['test1'] = newAssessment;

    await util.writeAndSyncCourseData(courseData);

    const syncedAssessmentSets = await util.dumpTable('assessment_sets');
    const syncedWorksheetSet = syncedAssessmentSets.find((as) => as.name === 'Worksheet');

    // Ensure that the Worksheet set was added and matches the corresponding set in DEFAULT_ASSESSMENT_SETS
    checkAssessmentSet(syncedWorksheetSet, {
      abbreviation: 'WS',
      name: 'Worksheet',
      heading: 'Worksheets',
      color: 'purple1',
    });

    const syncedMachineProblemSet = syncedAssessmentSets.find(
      (as) => as.name === 'Machine Problem',
    );

    // Ensure that the Machine Problem set was added and matches the corresponding set in DEFAULT_ASSESSMENT_SETS
    checkAssessmentSet(syncedMachineProblemSet, {
      abbreviation: 'MP',
      name: 'Machine Problem',
      heading: 'Machine Problems',
      color: 'turquoise1',
    });
  });
});
