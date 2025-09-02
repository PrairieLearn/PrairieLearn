import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import {
  type AssessmentModule,
  AssessmentModuleSchema,
  AssessmentSchema,
  CourseSchema,
} from '../../lib/db-types.js';
import * as helperDb from '../helperDb.js';

import * as util from './util.js';

/**
 * Checks that the assessment set present in the database matches the data
 * from the original assessment set in `infoCourse.json`.
 *
 * @param syncedAssessmentModule - The assessment set from the database
 * @param assessmentModule - The assessment set from `infoCourse.json`.
 */
function checkAssessmentModule(
  syncedAssessmentModule: AssessmentModule | null | undefined,
  assessmentModule: Partial<AssessmentModule>,
) {
  assert.isOk(syncedAssessmentModule);
  for (const key of Object.keys(assessmentModule)) {
    assert.equal(syncedAssessmentModule[key], assessmentModule[key]);
  }
}

describe('Assessment modules syncing', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(helperDb.resetDatabase);

  it('adds a new assessment module', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const newAssessmentModule = {
      name: 'New Module',
      heading: 'This is a new module',
    };
    courseData.course.assessmentModules.push(newAssessmentModule);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessmentModules = await util.dumpTableWithSchema(
      'assessment_modules',
      AssessmentModuleSchema,
    );
    const syncedAssessmentModule = syncedAssessmentModules.find(
      (am) => am.name === newAssessmentModule.name,
    );
    checkAssessmentModule(syncedAssessmentModule, newAssessmentModule);
  });

  it('removes an assessment module', async () => {
    const { courseData, courseDir } = await util.createAndSyncCourseData();
    const newAssessmentModule = {
      name: 'New Module',
      heading: 'This is a new module',
    };
    courseData.course.assessmentModules.push(newAssessmentModule);
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    courseData.course.assessmentModules.pop();
    await util.overwriteAndSyncCourseData(courseData, courseDir);
    const syncedAssessmentModules = await util.dumpTableWithSchema(
      'assessment_modules',
      AssessmentModuleSchema,
    );
    const syncedAssessmentModule = syncedAssessmentModules.find(
      (am) => am.name === newAssessmentModule.name,
    );
    assert.isUndefined(syncedAssessmentModule);
  });

  it('records a warning if two assessment modules have the same name', async () => {
    const courseData = util.getCourseData();
    const newAssessmentModule1 = {
      name: 'new assessment set',
      heading: 'new assessment module 1',
    };
    const newAssessmentModule2 = {
      name: 'new assessment set',
      heading: 'new assessment module 2',
    };
    courseData.course.assessmentModules.push(newAssessmentModule1, newAssessmentModule2);
    await util.writeAndSyncCourseData(courseData);
    const syncedAssessmentModules = await util.dumpTableWithSchema(
      'assessment_modules',
      AssessmentModuleSchema,
    );
    const syncedAssessmentModule = syncedAssessmentModules.find(
      (as) => as.name === newAssessmentModule2.name,
    );
    checkAssessmentModule(syncedAssessmentModule, newAssessmentModule2);
    const syncedCourses = await util.dumpTableWithSchema('pl_courses', CourseSchema);
    const syncedCourse = syncedCourses.find((c) => c.short_name === courseData.course.name);
    assert.match(syncedCourse?.sync_warnings ?? '', /Found duplicates in 'assessmentModules'/);
  });

  it('uses explicitly-created default assessment module', async () => {
    const courseData = util.getCourseData();
    const defaultAssessmentModule = {
      name: 'Default',
      heading: 'Default assessment module',
    };
    courseData.course.assessmentModules = [defaultAssessmentModule];
    await util.writeAndSyncCourseData(courseData);

    const syncedAssessmentModules = await util.dumpTableWithSchema(
      'assessment_modules',
      AssessmentModuleSchema,
    );
    assert.lengthOf(syncedAssessmentModules, 1);

    const syncedAssessmentModule = syncedAssessmentModules.find(
      (am) => am.name === defaultAssessmentModule.name,
    );
    checkAssessmentModule(syncedAssessmentModule, defaultAssessmentModule);

    const syncedAssessments = await util.dumpTableWithSchema('assessments', AssessmentSchema);
    assert.lengthOf(syncedAssessments, 1);

    const syncedAssessment = syncedAssessments.find((a) => a.tid === 'test');
    assert.isOk(syncedAssessment);
    assert.equal(syncedAssessment.assessment_module_id, syncedAssessmentModule?.id);
  });

  it('deletes all assessment modules when none are used', async () => {
    const courseData = util.getCourseData();

    // Perform an initial sync with the course's assessment modules.
    const { courseDir } = await util.writeAndSyncCourseData(courseData);

    // Assert there are some assessment modules in the database.
    const syncedAssessmentModules = await util.dumpTableWithSchema(
      'assessment_modules',
      AssessmentModuleSchema,
    );
    assert.isAtLeast(syncedAssessmentModules.length, 1);

    // Remove all course-level assessment modules.
    courseData.course.assessmentModules = [];

    // Remove all course instances, thus removing all assessments that would
    // have specified an assessment module.
    courseData.courseInstances = {};

    // Sync again.
    await util.overwriteAndSyncCourseData(courseData, courseDir);

    // Note that unlike assessment sets, we unconditionally sync a "Default" assessment
    // module, so we expect to have that single assessment modules in the database.
    const remainingAssessmentModules = await util.dumpTableWithSchema(
      'assessment_modules',
      AssessmentModuleSchema,
    );
    assert.lengthOf(remainingAssessmentModules, 1);
    assert.equal(remainingAssessmentModules[0].name, 'Default');
  });

  it('handles course with only a single implicit assessment module', async () => {
    const courseData = util.getCourseData();
    const courseInstance = courseData.courseInstances[util.COURSE_INSTANCE_ID];

    // Remove all course assessment modules.
    courseData.course.assessmentModules = [];

    // Save a reference to the test assessment.
    const testAssessment = courseInstance.assessments[util.ASSESSMENT_ID];

    // Remove all assessments.
    courseInstance.assessments = {};

    // Add a single assessment that uses a module that isn't in the list of defaults.
    courseInstance.assessments[util.ASSESSMENT_ID] = testAssessment;
    testAssessment.module = 'X';

    // Sync the course.
    await util.writeAndSyncCourseData(courseData);

    // Assert that the expected module is present and that it has the correct number.
    const syncedAssessmentModules = await util.dumpTableWithSchema(
      'assessment_modules',
      AssessmentModuleSchema,
    );

    // Note that unlike assessment sets, we unconditionally sync a "Default" assessment
    // module, so we expect to have two assessment modules in the database.
    assert.equal(syncedAssessmentModules.length, 2);

    const syncedAssessmentModule = syncedAssessmentModules.find((am) => am.name === 'X');
    checkAssessmentModule(syncedAssessmentModule, {
      name: 'X',
      heading: 'X',
      number: 1,
    });
  });
});
