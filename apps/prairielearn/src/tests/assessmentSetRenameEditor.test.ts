import * as path from 'path';

import fs from 'fs-extra';
import { afterAll, assert, beforeAll, beforeEach, describe, it } from 'vitest';

import type { Course, User } from '../lib/db-types.js';
import { AssessmentSetRenameEditor } from '../lib/editors.js';
import type { AssessmentJsonInput, AssessmentSetJsonInput } from '../schemas/index.js';

import * as helperDb from './helperDb.js';
import * as util from './sync/util.js';

/**
 * Gets the path to the infoAssessment.json file for a given course instance and assessment.
 */
function getAssessmentInfoPath(
  courseDir: string,
  courseInstanceId: string,
  assessmentId: string,
): string {
  return path.join(
    courseDir,
    'courseInstances',
    courseInstanceId,
    'assessments',
    assessmentId,
    'infoAssessment.json',
  );
}

/**
 * Creates mock locals object for the AssessmentSetRenameEditor.
 */
function createMockLocals(courseDir: string, courseId: string) {
  return {
    authz_data: {
      has_course_permission_edit: true,
      authn_user: { id: '1' },
    },
    course: {
      id: courseId,
      path: courseDir,
    } as Course,
    user: {
      id: '1',
    } as User,
  };
}

describe('AssessmentSetRenameEditor', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  beforeEach(helperDb.resetDatabase);

  it('rewrites multiple assessments when they share the same assessment set', async () => {
    const courseData = util.getCourseData();
    const testAssessmentSet = {
      name: 'Labs',
      abbreviation: 'L',
      heading: 'Lab assignments',
      color: 'red2',
    } satisfies AssessmentSetJsonInput;
    courseData.course.assessmentSets.push(testAssessmentSet);

    // Add multiple assessments using the same set
    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.lab01 = {
      uuid: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
      title: 'Lab 1',
      type: 'Homework',
      set: 'Labs',
      number: '1',
    } satisfies AssessmentJsonInput;

    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.lab02 = {
      uuid: 'd4e5f6a7-b8c9-0123-def0-234567890123',
      title: 'Lab 2',
      type: 'Homework',
      set: 'Labs',
      number: '2',
    } satisfies AssessmentJsonInput;

    courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.lab03 = {
      uuid: 'e5f6a7b8-c9d0-1234-ef01-345678901234',
      title: 'Lab 3',
      type: 'Homework',
      set: 'Labs',
      number: '3',
    } satisfies AssessmentJsonInput;

    const { courseDir, syncResults } = await util.writeAndSyncCourseData(courseData);

    // Create the editor and perform the rename
    const editor = new AssessmentSetRenameEditor({
      locals: createMockLocals(courseDir, syncResults.courseId),
      oldName: 'Labs',
      newName: 'Laboratory Exercises',
    });

    const result = await editor.write();

    // Verify all three assessments were updated
    assert.isNotNull(result);
    assert.equal(result.pathsToAdd.length, 3);

    // Verify each file was updated
    for (const labId of ['lab01', 'lab02', 'lab03']) {
      const infoPath = getAssessmentInfoPath(courseDir, util.COURSE_INSTANCE_ID, labId);
      const updatedInfo = await fs.readJson(infoPath);
      assert.equal(updatedInfo.set, 'Laboratory Exercises');
    }
  });
});
