/* eslint-disable @typescript-eslint/dot-notation */
import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import { type AssessmentSet, AssessmentSetSchema, CourseSchema } from '../../lib/db-types.js';
import { type AssessmentJsonInput, type AssessmentSetJsonInput } from '../../schemas/index.js';
import * as helperDb from '../helperDb.js';

import * as util from './util.js';

/**
 * Checks that the assessment set present in the database matches the data
 * from the original assessment set in `infoCourse.json`.
 *
 * @param syncedAssessmentSet - The assessment set from the database
 * @param assessmentSet - The assessment set from `infoCourse.json`.
 */
function checkAssessmentSet(
  syncedAssessmentSet: AssessmentSet | null | undefined,
  assessmentSet: Partial<AssessmentSet>,
) {
  assert.isOk(syncedAssessmentSet);
  for (const key of Object.keys(assessmentSet)) {
    assert.equal(
      syncedAssessmentSet[key as keyof AssessmentSet],
      assessmentSet[key as keyof AssessmentSet],
    );
  }
}

/**
 * Makes a new assessment.
 */
function makeAssessmentSet() {
  return {
    name: 'new assessment set',
    abbreviation: 'new',
    heading: 'a new assessment set to sync',
    color: 'red1',
  } satisfies AssessmentSetJsonInput;
}

describe('Assessment set syncing', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(helperDb.resetDatabase);

  it('adds a new assessment set', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const newAssessmentSet = makeAssessmentSet();
    courseData.course.assessmentSets.push(newAssessmentSet);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessmentSets = await util.dumpTableWithSchema(
      'assessment_sets',
      AssessmentSetSchema,
    );
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
    const syncedAssessmentSets = await util.dumpTableWithSchema(
      'assessment_sets',
      AssessmentSetSchema,
    );
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
    const dbAssessmentSets = await util.dumpTableWithSchema('assessment_sets', AssessmentSetSchema);
    assert.isUndefined(dbAssessmentSets.find((as) => as.name === oldName));
    const dbAssessmentSet = dbAssessmentSets.find((as) => as.name === newName);
    checkAssessmentSet(dbAssessmentSet, courseData.course.assessmentSets[0]);
  });

  it('records a warning if two assessment sets have the same name', async () => {
    const courseData = util.getCourseData();
    const newAssessmentSet1 = {
      name: 'new assessment set',
      abbreviation: 'new1',
      heading: 'a new assessment set 1 to sync',
      color: 'red1',
    } satisfies AssessmentSetJsonInput;
    const newAssessmentSet2 = {
      name: 'new assessment set',
      abbreviation: 'new2',
      heading: 'a new assessment set 2 to sync',
      color: 'red2',
    } satisfies AssessmentSetJsonInput;
    courseData.course.assessmentSets.push(newAssessmentSet1, newAssessmentSet2);
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessmentSets = await util.dumpTableWithSchema(
      'assessment_sets',
      AssessmentSetSchema,
    );
    const syncedAssessmentSet = syncedAssessmentSets.find(
      (as) => as.name === newAssessmentSet1.name,
    );
    checkAssessmentSet(syncedAssessmentSet, newAssessmentSet2);
    const syncedCourses = await util.dumpTableWithSchema('courses', CourseSchema);
    const syncedCourse = syncedCourses.find((c) => c.short_name === courseData.course.name);
    assert.match(syncedCourse?.sync_warnings ?? '', /Found duplicates in 'assessmentSets'/);
  });

  it('adds default assessment sets if used by assessments but not specified in courseData', async () => {
    const courseData = util.getCourseData();

    // The Machine Problem set is in DEFAULT_ASSESSMENT_SETS but not in courseData
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments[util.ASSESSMENT_ID]['set'] =
      'Machine Problem';

    const newAssessment = {
      uuid: '03f3b4d2-0264-48b7-bf42-107732142c01',
      title: 'Test assessment 2',
      type: 'Exam',
      set: 'Worksheet', // The Worksheet set is in DEFAULT_ASSESSMENT_SETS but not in courseData
      number: '101',
    } satisfies AssessmentJsonInput;
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments['test1'] = newAssessment;

    await util.writeAndSyncCourseData(courseData);

    const syncedAssessmentSets = await util.dumpTableWithSchema(
      'assessment_sets',
      AssessmentSetSchema,
    );
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

  it('deletes all assessment sets when none are used', async () => {
    const courseData = util.getCourseData();

    // Perform an initial sync with the course's assessment sets.
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // Assert there are some assessment sets in the database.
    const syncedAssessmentSets = await util.dumpTableWithSchema(
      'assessment_sets',
      AssessmentSetSchema,
    );
    assert.isAtLeast(syncedAssessmentSets.length, 1);

    // Remove all course-level assessment sets.
    courseData.course.assessmentSets = [];

    // Remove all course instances, thus removing all assessments that would
    // have specified an assessment set.
    courseData.courseInstances = {};

    // Sync again.
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    // Assert that there are no assessment sets in the database.
    const remainingAssessmentSets = await util.dumpTableWithSchema(
      'assessment_sets',
      AssessmentSetSchema,
    );
    assert.isEmpty(remainingAssessmentSets);
  });

  it('handles course with only a single implicit assessment set', async () => {
    const courseData = util.getCourseData();
    const courseInstance = courseData.courseInstances[util.COURSE_INSTANCE_ID];

    // Remove all course assessment sets.
    courseData.course.assessmentSets = [];

    // Save a reference to the test assessment.
    const testAssessment = courseInstance.assessments[util.ASSESSMENT_ID];

    // Remove all assessments.
    courseInstance.assessments = {};

    // Add a single assessment that uses a set that isn't in the list of defaults.
    courseInstance.assessments[util.ASSESSMENT_ID] = testAssessment;
    testAssessment.set = 'X';

    // Sync the course.
    await util.writeAndSyncCourseData(courseData);

    // Assert that the expected set is present and that it has the correct number.
    const syncedAssessmentSets = await util.dumpTableWithSchema(
      'assessment_sets',
      AssessmentSetSchema,
    );
    assert.equal(syncedAssessmentSets.length, 1);
    checkAssessmentSet(syncedAssessmentSets[0], {
      abbreviation: 'X',
      name: 'X',
      heading: 'X',
      color: 'gray1',
      number: 1,
    });
  });

  it('syncs JSON comments correctly', async () => {
    const courseData = util.getCourseData();
    const assessmentSetStringComment = {
      name: 'assessment set with comment',
      abbreviation: 'com',
      heading: 'assessment set with comment',
      color: 'red2',
      comment: 'assessment set comment',
    } satisfies AssessmentSetJsonInput;
    const assessmentSetArrayComment = {
      name: 'assessment set with an array comment',
      abbreviation: 'com',
      heading: 'assessment set with comment',
      color: 'red2',
      comment: ['comment 1', 'comment 2'],
    } satisfies AssessmentSetJsonInput;
    const assessmentSetObjectComment = {
      name: 'assessment set with an object comment',
      abbreviation: 'com',
      heading: 'assessment set with comment',
      color: 'red2',
      comment: { comment1: 'value1', comment2: 'value2' },
    } satisfies AssessmentSetJsonInput;
    courseData.course.assessmentSets.push(
      assessmentSetStringComment,
      assessmentSetArrayComment,
      assessmentSetObjectComment,
    );
    const courseDir = await util.writeCourseToTempDirectory(courseData);
    await util.syncCourseData(courseDir);
    const syncedAssessmentSets = await util.dumpTableWithSchema(
      'assessment_sets',
      AssessmentSetSchema,
    );
    const syncedAssessmentSetStringComment = syncedAssessmentSets.find(
      (as) => as.name === assessmentSetStringComment.name,
    );
    assert.equal(syncedAssessmentSetStringComment?.json_comment, 'assessment set comment');
    const syncedAssessmentSetArrayComment = syncedAssessmentSets.find(
      (as) => as.name === assessmentSetArrayComment.name,
    );
    assert.deepEqual(syncedAssessmentSetArrayComment?.json_comment, ['comment 1', 'comment 2']);
    const syncedAssessmentSetObjectComment = syncedAssessmentSets.find(
      (as) => as.name === assessmentSetObjectComment.name,
    );
    assert.deepEqual(syncedAssessmentSetObjectComment?.json_comment, {
      comment1: 'value1',
      comment2: 'value2',
    });
  });
});
