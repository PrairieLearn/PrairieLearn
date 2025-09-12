import * as path from 'path';

import fs from 'fs-extra';
import * as tmp from 'tmp-promise';
import { afterEach, assert, beforeEach, describe, it } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import * as chunksLib from '../lib/chunks.js';
import { config } from '../lib/config.js';
import { CourseSchema, IdSchema } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as courseDB from '../sync/course-db.js';
import { makeInfoFile } from '../sync/infofile.js';
import { syncDiskToSql } from '../sync/syncFromDisk.js';

import * as helperServer from './helperServer.js';
import { makeMockLogger } from './mockLogger.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const COURSE: courseDB.CourseData = {
  course: makeInfoFile(),
  questions: {
    'simple-question': makeInfoFile(),
    'complex/question': makeInfoFile(),
  },
  courseInstances: {
    'simple-course-instance': {
      courseInstance: makeInfoFile(),
      assessments: {
        'simple-assessment': makeInfoFile(),
        'complex/assessment': makeInfoFile(),
      },
    },
    'complex/course/instance': {
      courseInstance: makeInfoFile(),
      assessments: {
        'simple-assessment': makeInfoFile(),
        'complex/assessment': makeInfoFile(),
      },
    },
  },
};

async function getAllChunksForCourse(course_id) {
  return await sqldb.queryRows(
    sql.select_all_chunks,
    { course_id },
    z.object({
      id: z.string(),
      uuid: z.string(),
      type: z.string(),
      course_id: z.string(),
      course_instance_id: z.string().nullable(),
      assessment_id: z.string().nullable(),
      question_id: z.string().nullable(),
    }),
  );
}

describe('chunks', () => {
  describe('identifyChunksFromChangedFiles', () => {
    it('should identify change in element', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['elements/my-special-element/impl.py'],
        COURSE,
      );
      assert.isOk(chunks.elements);
    });

    it('should identify change in clientFilesCourse', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['clientFilesCourse/path/to/file.js'],
        COURSE,
      );
      assert.isOk(chunks.clientFilesCourse);
    });

    it('should identify change in serverFilesCourse', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['serverFilesCourse/path/to/file.js'],
        COURSE,
      );
      assert.isOk(chunks.serverFilesCourse);
    });

    it('should identify simple question', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['questions/simple-question/tests/test.py'],
        COURSE,
      );
      assert.isOk(chunks.questions.has('simple-question'));
    });

    it('should identify complex question', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['questions/complex/question/tests/test.py'],
        COURSE,
      );
      assert.isOk(chunks.questions.has('complex/question'));
    });

    it('should identify simple assessment in simple course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        [
          'courseInstances/simple-course-instance/assessments/simple-assessment/clientFilesAssessment/file.txt',
        ],
        COURSE,
      );
      assert.isOk(
        chunks.courseInstances['simple-course-instance'].assessments.has('simple-assessment'),
      );
    });

    it('should identify complex assessment in simple course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        [
          'courseInstances/simple-course-instance/assessments/complex/assessment/clientFilesAssessment/file.txt',
        ],
        COURSE,
      );
      assert.isOk(
        chunks.courseInstances['simple-course-instance'].assessments.has('complex/assessment'),
      );
    });

    it('should identify simple assessment in complex course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        [
          'courseInstances/complex/course/instance/assessments/simple-assessment/clientFilesAssessment/file.txt',
        ],
        COURSE,
      );
      assert.isOk(
        chunks.courseInstances['complex/course/instance'].assessments.has('simple-assessment'),
      );
    });

    it('should identify complex assessment in complex course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        [
          'courseInstances/complex/course/instance/assessments/complex/assessment/clientFilesAssessment/file.txt',
        ],
        COURSE,
      );
      assert.isOk(
        chunks.courseInstances['complex/course/instance'].assessments.has('complex/assessment'),
      );
    });

    it('should identify clientFilesCourseInstance in simple course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['courseInstances/simple-course-instance/clientFilesCourseInstance/file.txt'],
        COURSE,
      );
      assert.isOk(chunks.courseInstances['simple-course-instance'].clientFilesCourseInstance);
    });

    it('should identify clientFilesCourseInstance in complex course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['courseInstances/complex/course/instance/clientFilesCourseInstance/file.txt'],
        COURSE,
      );
      assert.isOk(chunks.courseInstances['complex/course/instance'].clientFilesCourseInstance);
    });
  });

  describe('coursePathForChunk', () => {
    it('works for elements chunk', () => {
      assert.equal(
        chunksLib.coursePathForChunk('/course/', { type: 'elements' }),
        '/course/elements',
      );
    });

    it('works for elementExtensions chunk', () => {
      assert.equal(
        chunksLib.coursePathForChunk('/course/', { type: 'elementExtensions' }),
        '/course/elementExtensions',
      );
    });

    it('works for clientFilesCourse chunk', () => {
      assert.equal(
        chunksLib.coursePathForChunk('/course/', { type: 'clientFilesCourse' }),
        '/course/clientFilesCourse',
      );
    });

    it('works for serverFilesCourse chunk', () => {
      assert.equal(
        chunksLib.coursePathForChunk('/course/', { type: 'serverFilesCourse' }),
        '/course/serverFilesCourse',
      );
    });

    it('works for simple clientFilesCourseInstance chunk', () => {
      assert.equal(
        chunksLib.coursePathForChunk('/course/', {
          type: 'clientFilesCourseInstance',
          courseInstanceName: 'foo',
        }),
        '/course/courseInstances/foo/clientFilesCourseInstance',
      );
    });

    it('works for complex clientFilesCourseInstance chunk', () => {
      assert.equal(
        chunksLib.coursePathForChunk('/course/', {
          type: 'clientFilesCourseInstance',
          courseInstanceName: 'foo/bar',
        }),
        '/course/courseInstances/foo/bar/clientFilesCourseInstance',
      );
    });

    it('works for simple clientFilesAssessment chunk', () => {
      assert.equal(
        chunksLib.coursePathForChunk('/course/', {
          type: 'clientFilesAssessment',
          courseInstanceName: 'foo',
          assessmentName: 'bar',
        }),
        '/course/courseInstances/foo/assessments/bar/clientFilesAssessment',
      );
    });

    it('works for complex clientFilesAssessment chunk', () => {
      assert.equal(
        chunksLib.coursePathForChunk('/course/', {
          type: 'clientFilesAssessment',
          courseInstanceName: 'foo/bar',
          assessmentName: 'bar/baz',
        }),
        '/course/courseInstances/foo/bar/assessments/bar/baz/clientFilesAssessment',
      );
    });

    it('works for simple question chunk', () => {
      assert.equal(
        chunksLib.coursePathForChunk('/course/', {
          type: 'question',
          questionName: 'foo',
        }),
        '/course/questions/foo',
      );
    });

    it('works for complex question chunk', () => {
      assert.equal(
        chunksLib.coursePathForChunk('/course/', {
          type: 'question',
          questionName: 'foo/bar',
        }),
        '/course/questions/foo/bar',
      );
    });
  });

  describe('ensureChunksForCourse', { timeout: 60_000 }, function () {
    let tempTestCourseDir: tmp.DirectoryResult;
    let tempChunksDir: tmp.DirectoryResult;
    const originalChunksConsumerDirectory = config.chunksConsumerDirectory;
    let courseId;
    let courseInstanceId;
    let assessmentId;
    let questionId;
    let nestedQuestionId;

    beforeEach(async () => {
      // We need to modify the test course - create a copy that we can
      // safely manipulate.
      tempTestCourseDir = await tmp.dir({ unsafeCleanup: true });
      await fs.copy(TEST_COURSE_PATH, tempTestCourseDir.path, {
        overwrite: true,
      });

      // `testCourse` doesn't include an `elementExtensions` directory.
      // We add one here for the sake of testing.
      await fs.ensureDir(path.join(tempTestCourseDir.path, 'elementExtensions'));

      // We'll add a `serverFilesCourse` directory too.
      await fs.ensureDir(path.join(tempTestCourseDir.path, 'serverFilesCourse'));

      // We need to override the chunks directory too.
      tempChunksDir = await tmp.dir({ unsafeCleanup: true });

      config.chunksConsumerDirectory = tempChunksDir.path;
      config.chunksConsumer = true;

      await helperServer.before(tempTestCourseDir.path)();

      // Find the ID of this course
      const results = await sqldb.queryRow(
        sql.select_course_by_path,
        { course_path: tempTestCourseDir.path },
        CourseSchema,
      );
      courseId = results.id;

      // Find the ID of the course instance
      courseInstanceId = await sqldb.queryRow(
        sql.select_course_instance,
        { long_name: 'Spring 2015' },
        IdSchema,
      );

      // Find the ID of an assessment that has clientFilesAssessment
      assessmentId = await sqldb.queryRow(
        sql.select_assessment,
        { tid: 'exam1-automaticTestSuite' },
        IdSchema,
      );

      // Find the ID of a question.
      questionId = await sqldb.queryRow(sql.select_question, { qid: 'addNumbers' }, IdSchema);

      // Find the ID of a nested question.
      nestedQuestionId = await sqldb.queryRow(
        sql.select_question,
        { qid: 'subfolder/nestedQuestion' },
        IdSchema,
      );
    });

    it('creates clientFilesCourseInstance chunk for new course instance id after UUID change', async () => {
      const courseDir = tempTestCourseDir.path;

      // Generate initial chunks for the test course.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId,
        courseData: await courseDB.loadFullCourse(courseId, courseDir),
      });

      // Verify that an initial chunk exists for this course instance.
      let databaseChunks = await getAllChunksForCourse(courseId);
      assert.isOk(
        databaseChunks.find(
          (chunk) =>
            chunk.type === 'clientFilesCourseInstance' &&
            chunk.course_instance_id === courseInstanceId,
        ),
        'expected initial clientFilesCourseInstance chunk to exist',
      );

      // Change only the UUID in infoCourseInstance.json for Sp15
      const infoCourseInstancePath = path.join(
        courseDir,
        'courseInstances',
        'Sp15',
        'infoCourseInstance.json',
      );
      const infoCiJson = await fs.readJson(infoCourseInstancePath);
      infoCiJson.uuid = '22222222-2222-4222-8222-222222222222';
      await fs.writeJson(infoCourseInstancePath, infoCiJson, { spaces: 2 });

      // Sync course to DB so that the course_instance row is replaced (soft-delete old, insert new)
      const { logger } = makeMockLogger();
      await syncDiskToSql(courseId, courseDir, logger);

      // Fetch the (new) course instance ID by long_name; this should now differ from the previous id
      const newCourseInstanceId = await sqldb.queryRow(
        sql.select_course_instance,
        { long_name: 'Spring 2015' },
        IdSchema,
      );
      assert.notEqual(
        newCourseInstanceId,
        courseInstanceId,
        'expected course_instance id to change after UUID update',
      );

      // Regenerate chunks. After the fix, this should create a new chunk for newCourseInstanceId
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId,
        courseData: await courseDB.loadFullCourse(courseId, courseDir),
      });

      // Re-read chunks from DB
      databaseChunks = await getAllChunksForCourse(courseId);

      // A chunk should exist for the new course instance id.
      assert.isOk(
        databaseChunks.find(
          (chunk) =>
            chunk.type === 'clientFilesCourseInstance' &&
            chunk.course_instance_id === newCourseInstanceId,
        ),
        'expected clientFilesCourseInstance chunk for new course_instance id to exist after UUID change',
      );
    });

    it('no-op update does not create duplicate chunks when IDs unchanged', async () => {
      const courseDir = tempTestCourseDir.path;

      // Generate initial chunks for the test course.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId,
        courseData: await courseDB.loadFullCourse(courseId, courseDir),
      });

      // Capture baseline chunk set and counts
      const initialChunks = await getAllChunksForCourse(courseId);
      const initialCount = initialChunks.length;
      const countBy = (pred: (c: any) => boolean) => initialChunks.filter(pred).length;

      const initialCourseCount = countBy((c) => c.type === 'clientFilesCourse');
      const initialCiCount = countBy(
        (c) => c.type === 'clientFilesCourseInstance' && c.course_instance_id === courseInstanceId,
      );
      const initialAssessCount = countBy(
        (c) => c.type === 'clientFilesAssessment' && c.assessment_id === assessmentId,
      );

      // Run update again with no changes
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId,
        courseData: await courseDB.loadFullCourse(courseId, courseDir),
      });

      // Fetch again and ensure counts are unchanged
      const afterChunks = await getAllChunksForCourse(courseId);
      const afterCount = afterChunks.length;
      assert.equal(afterCount, initialCount, 'expected total chunk count to remain unchanged');

      const afterCourseCount = afterChunks.filter((c) => c.type === 'clientFilesCourse').length;
      const afterCiCount = afterChunks.filter(
        (c) => c.type === 'clientFilesCourseInstance' && c.course_instance_id === courseInstanceId,
      ).length;
      const afterAssessCount = afterChunks.filter(
        (c) => c.type === 'clientFilesAssessment' && c.assessment_id === assessmentId,
      ).length;

      assert.equal(
        afterCourseCount,
        initialCourseCount,
        'expected clientFilesCourse chunk count to remain unchanged',
      );
      assert.equal(
        afterCiCount,
        initialCiCount,
        'expected clientFilesCourseInstance chunk count to remain unchanged',
      );
      assert.equal(
        afterAssessCount,
        initialAssessCount,
        'expected clientFilesAssessment chunk count to remain unchanged',
      );
    });

    it('reproduces missing clientFilesAssessment chunk after assessment UUID change (will fail until fixed)', async () => {
      const courseDir = tempTestCourseDir.path;

      // Generate initial chunks for the test course.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId,
        courseData: await courseDB.loadFullCourse(courseId, courseDir),
      });

      // Verify that an initial chunk exists for this assessment.
      let databaseChunks = await getAllChunksForCourse(courseId);
      assert.isOk(
        databaseChunks.find(
          (chunk) => chunk.type === 'clientFilesAssessment' && chunk.assessment_id === assessmentId,
        ),
        'expected initial clientFilesAssessment chunk to exist',
      );

      // Change only the UUID in infoAssessment.json for exam1-automaticTestSuite
      const infoAssessmentPath = path.join(
        courseDir,
        'courseInstances',
        'Sp15',
        'assessments',
        'exam1-automaticTestSuite',
        'infoAssessment.json',
      );
      const infoJson = await fs.readJson(infoAssessmentPath);
      // Set a new UUID value to simulate a UUID rotation
      infoJson.uuid = '11111111-1111-4111-8111-111111111111';
      await fs.writeJson(infoAssessmentPath, infoJson, { spaces: 2 });

      // Sync course to DB so that the assessment row is replaced (soft-delete old, insert new)
      const { logger } = makeMockLogger();
      await syncDiskToSql(courseId, courseDir, logger);

      // Fetch the (new) assessment ID by TID; this should now differ from the previous id
      const newAssessmentId = await sqldb.queryRow(
        sql.select_assessment,
        { tid: 'exam1-automaticTestSuite' },
        IdSchema,
      );
      assert.notEqual(
        newAssessmentId,
        assessmentId,
        'expected assessment id to change after UUID update',
      );

      // Regenerate chunks. Current buggy behavior: this will NOT create a new chunk for newAssessmentId
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId,
        courseData: await courseDB.loadFullCourse(courseId, courseDir),
      });

      // Re-read chunks from DB
      databaseChunks = await getAllChunksForCourse(courseId);

      // After the fix: a chunk should exist for the new assessment id.
      // Today (pre-fix): this assertion will fail because we don't regenerate the chunk.
      assert.isOk(
        databaseChunks.find(
          (chunk) =>
            chunk.type === 'clientFilesAssessment' && chunk.assessment_id === newAssessmentId,
        ),
        'expected clientFilesAssessment chunk for new assessment id to exist after UUID change',
      );
    });
    afterEach(async () => {
      try {
        await tempTestCourseDir.cleanup();
        await tempChunksDir.cleanup();
      } catch (err) {
        console.error(err);
      }
      await helperServer.after();

      config.chunksConsumer = false;
      config.chunksConsumerDirectory = originalChunksConsumerDirectory;
    });

    it('handles question nesting after a rename', async () => {
      // Scenario: there's a question named `foo/bar` (that is,
      // `foo/bar/info.json` exists). We load the chunk for that
      // question. We then move that `info.json` file to
      // `foo/bar/baz/info.json`. We then try to load that chunk again. In the
      // past, the new chunk would be written to an invalid location. This test
      // ensures that it's written correctly.

      const courseDir = tempTestCourseDir.path;
      const courseRuntimeDir = chunksLib.getRuntimeDirectoryForCourse({
        id: courseId,
        path: courseDir,
      });

      // Generate chunks for the test course.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId,
        courseData: await courseDB.loadFullCourse(courseId, courseDir),
      });

      const chunksToLoad: chunksLib.Chunk[] = [{ type: 'question', questionId }];

      // Load the question's chunk.
      await chunksLib.ensureChunksForCourseAsync(courseId, chunksToLoad);

      // Move the question. We can't directly move a directory to a subdirectory
      // of itself, so we move it to a temporary location first.
      const oldPath = path.join(courseDir, 'questions', 'addNumbers');
      const tempPath = path.join(courseDir, 'questions', 'addNumbersTemp');
      const newPath = path.join(courseDir, 'questions', 'addNumbers', 'addNumbersNested');
      await fs.move(oldPath, tempPath);
      await fs.move(tempPath, newPath);

      // Sync course to DB.
      const { logger } = makeMockLogger();
      await syncDiskToSql(courseId, courseDir, logger);

      // Regenerate chunks.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId,
        courseData: await courseDB.loadFullCourse(courseId, courseDir),
      });

      // Reload chunks.
      await chunksLib.ensureChunksForCourseAsync(courseId, chunksToLoad);

      // Check that the chunk was written to the correct location.
      assert.isOk(
        await fs.pathExists(
          path.join(courseRuntimeDir, 'questions', 'addNumbers', 'addNumbersNested', 'info.json'),
        ),
      );
    });

    it('handles question unnesting after a rename', async () => {
      // Scenario: there's a question named `foo/bar/baz` (that is,
      // `foo/bar/baz/info.json` exists). We load the chunk for that
      // question. We then move that `info.json` file to `foo/bar/info.json`. We
      // then try to load that chunk again. In the past, we'd fail to load the
      // new chunk correctly. This test ensures that it's loaded correctly.
      const courseDir = tempTestCourseDir.path;
      const courseRuntimeDir = chunksLib.getRuntimeDirectoryForCourse({
        id: courseId,
        path: courseDir,
      });

      // Generate chunks for the test course.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId,
        courseData: await courseDB.loadFullCourse(courseId, courseDir),
      });

      const chunksToLoad: chunksLib.Chunk[] = [{ type: 'question', questionId: nestedQuestionId }];

      // Load the question's chunk.
      await chunksLib.ensureChunksForCourseAsync(courseId, chunksToLoad);

      // Move the question. We can't directly move a directory to one of its
      // parent directories, so we move it to a temporary location first.
      const oldPath = path.join(courseDir, 'questions', 'subfolder', 'nestedQuestion');
      const tempPath = path.join(courseDir, 'questions', 'subfolderTemp');
      const newPath = path.join(courseDir, 'questions', 'subfolder');
      await fs.move(oldPath, tempPath);
      await fs.remove(newPath);
      await fs.move(tempPath, newPath);

      // Sync course to DB.
      const { logger } = makeMockLogger();
      await syncDiskToSql(courseId, courseDir, logger);

      // Regenerate chunks.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId,
        courseData: await courseDB.loadFullCourse(courseId, courseDir),
      });

      // Reload chunks.
      await chunksLib.ensureChunksForCourseAsync(courseId, chunksToLoad);

      // Check that the chunk was written to the correct location.
      assert.isOk(
        await fs.pathExists(path.join(courseRuntimeDir, 'questions', 'subfolder', 'info.json')),
      );
    });

    it('deletes chunks that are no longer needed', async () => {
      const courseDir = tempTestCourseDir.path;
      const courseRuntimeDir = chunksLib.getRuntimeDirectoryForCourse({
        id: courseId,
        path: courseDir,
      });

      const chunksToLoad: chunksLib.Chunk[] = [
        {
          type: 'elements',
        },
        {
          type: 'elementExtensions',
        },
        {
          type: 'serverFilesCourse',
        },
        {
          type: 'clientFilesCourse',
        },
        {
          type: 'clientFilesCourseInstance',
          courseInstanceId,
        },
        {
          type: 'clientFilesAssessment',
          courseInstanceId,
          assessmentId,
        },
        {
          type: 'question',
          questionId,
        },
      ];

      // Generate chunks for the test course
      await chunksLib.updateChunksForCourse({
        coursePath: tempTestCourseDir.path,
        courseId,
        courseData: await courseDB.loadFullCourse(courseId, courseDir),
      });

      // Load and unpack chunks
      await chunksLib.ensureChunksForCourseAsync(courseId, chunksToLoad);

      // Assert that the unpacked chunks exist on disk
      assert.isOk(await fs.pathExists(path.join(courseRuntimeDir, 'elements')));
      assert.isOk(await fs.pathExists(path.join(courseRuntimeDir, 'elementExtensions')));
      assert.isOk(await fs.pathExists(path.join(courseRuntimeDir, 'serverFilesCourse')));
      assert.isOk(await fs.pathExists(path.join(courseRuntimeDir, 'clientFilesCourse')));
      assert.isOk(
        await fs.pathExists(
          path.join(courseRuntimeDir, 'courseInstances', 'Sp15', 'clientFilesCourseInstance'),
        ),
      );
      assert.isOk(
        await fs.pathExists(
          path.join(
            courseRuntimeDir,
            'courseInstances',
            'Sp15',
            'assessments',
            'exam1-automaticTestSuite',
            'clientFilesAssessment',
          ),
        ),
      );
      assert.isOk(
        await fs.pathExists(
          path.join(courseRuntimeDir, 'questions', 'addNumbers', 'question.html'),
        ),
      );

      // Remove subset of directories from the course
      await fs.remove(path.join(courseDir, 'elements'));
      await fs.remove(path.join(courseDir, 'elementExtensions'));

      // Sync course to DB.
      const { logger } = makeMockLogger();
      await syncDiskToSql(courseId, courseDir, logger);

      // Regenerate chunks
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId,
        courseData: await courseDB.loadFullCourse(courseId, courseDir),
      });

      // Reload the chunks
      await chunksLib.ensureChunksForCourseAsync(courseId, chunksToLoad);

      // Assert that the chunks have been removed from disk
      assert.isNotOk(await fs.pathExists(path.join(courseRuntimeDir, 'elements')));
      assert.isNotOk(await fs.pathExists(path.join(courseRuntimeDir, 'elementExtensions')));

      // Assert that the chunks have been deleted from the database
      let databaseChunks = await getAllChunksForCourse(courseId);
      assert.isUndefined(databaseChunks.find((chunk) => chunk.type === 'elements'));
      assert.isUndefined(databaseChunks.find((chunk) => chunk.type === 'elementExtensions'));

      // Also assert that the chunks for directories that do exist are still there
      assert.isOk(await fs.pathExists(path.join(courseRuntimeDir, 'serverFilesCourse')));
      assert.isOk(await fs.pathExists(path.join(courseRuntimeDir, 'clientFilesCourse')));
      assert.isOk(
        await fs.pathExists(
          path.join(courseRuntimeDir, 'courseInstances', 'Sp15', 'clientFilesCourseInstance'),
        ),
      );
      assert.isOk(
        await fs.pathExists(
          path.join(
            courseRuntimeDir,
            'courseInstances',
            'Sp15',
            'assessments',
            'exam1-automaticTestSuite',
            'clientFilesAssessment',
          ),
        ),
      );
      assert.isOk(await fs.pathExists(path.join(courseRuntimeDir, 'questions', 'addNumbers')));

      // Also assert that the database still has chunks for directories that do exist
      assert.isOk(databaseChunks.find((chunk) => chunk.type === 'serverFilesCourse'));
      assert.isOk(databaseChunks.find((chunk) => chunk.type === 'clientFilesCourse'));
      assert.isOk(
        databaseChunks.find(
          (chunk) =>
            chunk.type === 'clientFilesCourseInstance' &&
            chunk.course_instance_id === courseInstanceId,
        ),
      );
      assert.isOk(
        databaseChunks.find(
          (chunk) => chunk.type === 'clientFilesAssessment' && chunk.assessment_id === assessmentId,
        ),
      );
      assert.isOk(databaseChunks.find((chunk) => chunk.type === 'question' && chunk.question_id));

      // Remove remaining directories from the course
      await fs.remove(path.join(courseDir, 'serverFilesCourse'));
      await fs.remove(path.join(courseDir, 'clientFilesCourse'));
      await fs.remove(path.join(courseDir, 'courseInstances', 'Sp15', 'clientFilesCourseInstance'));
      await fs.remove(
        path.join(
          courseDir,
          'courseInstances',
          'Sp15',
          'assessments',
          'exam1-automaticTestSuite',
          'clientFilesAssessment',
        ),
      );
      await fs.remove(path.join(courseDir, 'questions', 'addNumbers'));

      // Sync course to DB.
      await syncDiskToSql(courseId, courseDir, logger);

      // Regenerate chunks
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId,
        courseData: await courseDB.loadFullCourse(courseId, courseDir),
      });

      // Reload the chunks
      await chunksLib.ensureChunksForCourseAsync(courseId, chunksToLoad);

      // Assert that the remaining chunks have been removed from disk
      assert.isNotOk(await fs.pathExists(path.join(courseRuntimeDir, 'serverFilesCourse')));
      assert.isNotOk(await fs.pathExists(path.join(courseRuntimeDir, 'clientFilesCourse')));
      assert.isNotOk(
        await fs.pathExists(
          path.join(courseRuntimeDir, 'courseInstances', 'Sp15', 'clientFilesCourseInstance'),
        ),
      );
      assert.isNotOk(
        await fs.pathExists(
          path.join(
            courseRuntimeDir,
            'courseInstances',
            'Sp15',
            'assessments',
            'exam1-automaticTestSuite',
            'clientFilesAssessment',
          ),
        ),
      );
      assert.isNotOk(
        await fs.pathExists(
          path.join(courseRuntimeDir, 'questions', 'addNumbers', 'question.html'),
        ),
      );

      // Assert that the remaining chunks have been deleted from the database
      databaseChunks = await getAllChunksForCourse(courseId);
      assert.isUndefined(databaseChunks.find((chunk) => chunk.type === 'serverFilesCourse'));
      assert.isUndefined(databaseChunks.find((chunk) => chunk.type === 'clientFilesCourse'));
      assert.isUndefined(
        databaseChunks.find(
          (chunk) =>
            chunk.type === 'clientFilesCourseInstance' &&
            chunk.course_instance_id === courseInstanceId,
        ),
      );
      assert.isUndefined(
        databaseChunks.find(
          (chunk) => chunk.type === 'clientFilesAssessment' && chunk.assessment_id === assessmentId,
        ),
      );
      assert.isUndefined(
        databaseChunks.find(
          (chunk) => chunk.type === 'question' && chunk.question_id === questionId,
        ),
      );
    });
  });
});
