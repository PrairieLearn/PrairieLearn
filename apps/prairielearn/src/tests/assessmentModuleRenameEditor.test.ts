import * as path from 'path';

import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import type { Course, User } from '../lib/db-types.js';
import { AssessmentModuleRenameEditor } from '../lib/editors.js';
import type { AssessmentJsonInput } from '../schemas/index.js';

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
 * Creates mock locals object for the AssessmentModuleRenameEditor.
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

describe('AssessmentModuleRenameEditor', () => {
  beforeAll(helperDb.before);

  afterAll(helperDb.after);

  it('renames assessments on disk even when they are not synced to the database', () =>
    helperDb.runInTransactionAndRollback(async () => {
      const courseData = util.getCourseData();
      courseData.course.assessmentModules.push({
        name: 'Module1',
        heading: 'Module 1',
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.hw01 = {
        uuid: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
        title: 'Homework 1',
        type: 'Homework',
        set: 'Homework',
        module: 'Module1',
        number: '1',
      } satisfies AssessmentJsonInput;

      // Write the course to disk without syncing it to the database.
      const courseDir = await util.writeCourseToTempDirectory(courseData);

      const editor = new AssessmentModuleRenameEditor({
        locals: createMockLocals(courseDir, '1'),
        renames: [{ oldName: 'Module1', newName: 'Module One' }],
      });

      const result = await editor.write();

      assert.isNotNull(result);
      assert.equal(result.pathsToAdd.length, 1);

      const infoPath = getAssessmentInfoPath(courseDir, util.COURSE_INSTANCE_ID, 'hw01');
      const updatedInfo = await fs.readJson(infoPath);
      assert.equal(updatedInfo.module, 'Module One');
    }));

  it('removes the module field when newName is null', () =>
    helperDb.runInTransactionAndRollback(async () => {
      const courseData = util.getCourseData();
      courseData.course.assessmentModules.push({
        name: 'Module1',
        heading: 'Module 1',
      });

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.hw01 = {
        uuid: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
        title: 'Homework 1',
        type: 'Homework',
        set: 'Homework',
        module: 'Module1',
        number: '1',
      } satisfies AssessmentJsonInput;

      const courseDir = await util.writeCourseToTempDirectory(courseData);

      const editor = new AssessmentModuleRenameEditor({
        locals: createMockLocals(courseDir, '1'),
        renames: [{ oldName: 'Module1', newName: null }],
      });

      const result = await editor.write();

      assert.isNotNull(result);
      assert.equal(result.pathsToAdd.length, 1);

      const updatedInfo = await fs.readJson(
        getAssessmentInfoPath(courseDir, util.COURSE_INSTANCE_ID, 'hw01'),
      );
      assert.notProperty(updatedInfo, 'module');
    }));

  it('does not rewrite assessments that reference a different module', () =>
    helperDb.runInTransactionAndRollback(async () => {
      const courseData = util.getCourseData();
      courseData.course.assessmentModules.push(
        { name: 'Module1', heading: 'Module 1' },
        { name: 'Module2', heading: 'Module 2' },
      );

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.hw01 = {
        uuid: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
        title: 'Homework 1',
        type: 'Homework',
        set: 'Homework',
        module: 'Module1',
        number: '1',
      } satisfies AssessmentJsonInput;

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.hw02 = {
        uuid: 'd4e5f6a7-b8c9-0123-def0-234567890123',
        title: 'Homework 2',
        type: 'Homework',
        set: 'Homework',
        module: 'Module2',
        number: '2',
      } satisfies AssessmentJsonInput;

      const courseDir = await util.writeCourseToTempDirectory(courseData);

      const editor = new AssessmentModuleRenameEditor({
        locals: createMockLocals(courseDir, '1'),
        renames: [{ oldName: 'Module1', newName: 'Module One' }],
      });

      const result = await editor.write();

      assert.isNotNull(result);
      assert.equal(result.pathsToAdd.length, 1);

      const hw02Info = await fs.readJson(
        getAssessmentInfoPath(courseDir, util.COURSE_INSTANCE_ID, 'hw02'),
      );
      assert.equal(hw02Info.module, 'Module2');
    }));

  it('swaps two module names in a single pass without cascading', () =>
    helperDb.runInTransactionAndRollback(async () => {
      const courseData = util.getCourseData();
      courseData.course.assessmentModules.push(
        { name: 'Module1', heading: 'Module 1' },
        { name: 'Module2', heading: 'Module 2' },
      );

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.hw01 = {
        uuid: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
        title: 'Homework 1',
        type: 'Homework',
        set: 'Homework',
        module: 'Module1',
        number: '1',
      } satisfies AssessmentJsonInput;

      courseData.courseInstances[util.COURSE_INSTANCE_ID].assessments.hw02 = {
        uuid: 'd4e5f6a7-b8c9-0123-def0-234567890123',
        title: 'Homework 2',
        type: 'Homework',
        set: 'Homework',
        module: 'Module2',
        number: '2',
      } satisfies AssessmentJsonInput;

      const courseDir = await util.writeCourseToTempDirectory(courseData);

      const editor = new AssessmentModuleRenameEditor({
        locals: createMockLocals(courseDir, '1'),
        renames: [
          { oldName: 'Module1', newName: 'Module2' },
          { oldName: 'Module2', newName: 'Module1' },
        ],
      });

      const result = await editor.write();

      assert.isNotNull(result);
      assert.equal(result.pathsToAdd.length, 2);

      const hw01Info = await fs.readJson(
        getAssessmentInfoPath(courseDir, util.COURSE_INSTANCE_ID, 'hw01'),
      );
      assert.equal(hw01Info.module, 'Module2');

      const hw02Info = await fs.readJson(
        getAssessmentInfoPath(courseDir, util.COURSE_INSTANCE_ID, 'hw02'),
      );
      assert.equal(hw02Info.module, 'Module1');
    }));
});
