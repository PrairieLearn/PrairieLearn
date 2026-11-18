import * as path from 'path';

import { execa } from 'execa';
import fs from 'fs-extra';
import * as tmp from 'tmp-promise';
import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import * as chunksLib from '../lib/chunks.js';
import { config } from '../lib/config.js';
import { type Course, CourseSchema, QuestionVersionSettingSchema } from '../lib/db-types.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectCourseInstanceByShortName } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
import { selectOptionalQuestionVersionAtDate } from '../models/question-version.js';
import { selectQuestionById } from '../models/question.js';
import { QuestionJsonSchema } from '../schemas/infoQuestion.js';
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
      assert.isTrue(
        chunks.courseInstances.get('simple-course-instance')?.assessments.has('simple-assessment'),
      );
    });

    it('should identify complex assessment in simple course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        [
          'courseInstances/simple-course-instance/assessments/complex/assessment/clientFilesAssessment/file.txt',
        ],
        COURSE,
      );
      assert.isTrue(
        chunks.courseInstances.get('simple-course-instance')?.assessments.has('complex/assessment'),
      );
    });

    it('should identify simple assessment in complex course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        [
          'courseInstances/complex/course/instance/assessments/simple-assessment/clientFilesAssessment/file.txt',
        ],
        COURSE,
      );
      assert.isTrue(
        chunks.courseInstances.get('complex/course/instance')?.assessments.has('simple-assessment'),
      );
    });

    it('should identify complex assessment in complex course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        [
          'courseInstances/complex/course/instance/assessments/complex/assessment/clientFilesAssessment/file.txt',
        ],
        COURSE,
      );
      assert.isTrue(
        chunks.courseInstances
          .get('complex/course/instance')
          ?.assessments.has('complex/assessment'),
      );
    });

    it('should identify clientFilesCourseInstance in simple course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['courseInstances/simple-course-instance/clientFilesCourseInstance/file.txt'],
        COURSE,
      );
      assert.isTrue(
        chunks.courseInstances.get('simple-course-instance')?.clientFilesCourseInstance,
      );
    });

    it('should identify clientFilesCourseInstance in complex course instance', () => {
      const chunks = chunksLib.identifyChunksFromChangedFiles(
        ['courseInstances/complex/course/instance/clientFilesCourseInstance/file.txt'],
        COURSE,
      );
      assert.isTrue(
        chunks.courseInstances.get('complex/course/instance')?.clientFilesCourseInstance,
      );
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
    let course: Course;
    let courseInstanceId: string;
    let assessmentId: string;
    let questionId: string;
    let nestedQuestionId: string;

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

      // Find this course
      course = await sqldb.queryRow(
        sql.select_course_by_path,
        { course_path: tempTestCourseDir.path },
        CourseSchema,
      );

      // Find the ID of the course instance
      courseInstanceId = await sqldb.queryScalar(
        sql.select_course_instance,
        { long_name: 'Spring 2015' },
        IdSchema,
      );

      // Find the ID of an assessment that has clientFilesAssessment
      assessmentId = await sqldb.queryScalar(
        sql.select_assessment,
        { tid: 'exam1-automaticTestSuite' },
        IdSchema,
      );

      // Find the ID of a question.
      questionId = await sqldb.queryScalar(sql.select_question, { qid: 'addNumbers' }, IdSchema);

      // Find the ID of a nested question.
      nestedQuestionId = await sqldb.queryScalar(
        sql.select_question,
        { qid: 'subfolder/nestedQuestion' },
        IdSchema,
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

    it('preserves earlier revisions when chunks are changed or deleted', async () => {
      const courseDir = tempTestCourseDir.path;
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });
      const baselineDate = new Date('2000-01-01T00:00:00.000Z');
      await sqldb.execute(sql.prepare_history_baseline, {
        course_id: course.id,
        created_at: baselineDate,
      });
      const baselineChunks = await chunksLib.selectChunksForCourse(course.id);

      await fs.remove(path.join(courseDir, 'elements'));
      await fs.writeFile(path.join(courseDir, 'serverFilesCourse', 'changed.py'), '');
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
        changedFiles: ['serverFilesCourse/changed.py'],
      });

      const current = await chunksLib.selectChunksForCourse(course.id);
      assert.isUndefined(current.find((chunk) => chunk.type === 'elements'));
      const changed = current.find((chunk) => chunk.type === 'serverFilesCourse');
      assert.isDefined(changed);
      assert.notEqual(
        changed.uuid,
        baselineChunks.find((chunk) => chunk.type === 'serverFilesCourse')?.uuid,
      );
      const atBaseline = await chunksLib.selectChunksForCourse(course.id, baselineDate);
      expect(new Set(atBaseline.map((chunk) => chunk.uuid))).toEqual(
        new Set(baselineChunks.map((chunk) => chunk.uuid)),
      );
    });

    it('preserves settings across metadata-only and code-only question changes', async () => {
      const courseDir = tempTestCourseDir.path;
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });
      const initialVersions = await sqldb.queryRows(
        sql.select_question_versions,
        { question_id: questionId },
        QuestionVersionSettingSchema,
      );
      expect(initialVersions).toHaveLength(1);
      expect(initialVersions[0].partial_credit).toBe(true);

      const infoPath = path.join(courseDir, 'questions/addNumbers/info.json');
      const originalInfo = QuestionJsonSchema.parse(await fs.readJson(infoPath));
      await fs.writeJson(infoPath, {
        ...originalInfo,
        partialCredit: false,
      });
      const { logger } = makeMockLogger();
      const syncResult = await syncDiskToSql(course, logger);
      assert(syncResult.status === 'complete');
      assert.isFalse(syncResult.hadJsonErrors);
      // Exercise settings comparison independently of Git's changed-file list.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: syncResult.courseData,
        changedFiles: [],
      });
      const metadataVersions = await sqldb.queryRows(
        sql.select_question_versions,
        { question_id: questionId },
        QuestionVersionSettingSchema,
      );
      expect(metadataVersions).toHaveLength(2);
      expect(metadataVersions[0]).toEqual(initialVersions[0]);
      expect(metadataVersions[1].partial_credit).toBe(false);
      const liveQuestion = await selectQuestionById(questionId);
      expect(metadataVersions[1]).toEqual({
        ...QuestionVersionSettingSchema.omit({ question_version_id: true }).parse(liveQuestion),
        question_version_id: metadataVersions[1].question_version_id,
      });

      const publications = await sqldb.queryRows(
        sql.select_question_publications,
        { question_id: questionId },
        z.object({
          version_date: z.string(),
          chunk_date: z.string(),
          version_id: IdSchema,
          chunk_id: IdSchema,
        }),
      );
      for (const publication of publications) {
        const historical = await selectOptionalQuestionVersionAtDate({
          question_id: questionId,
          at_date: publication.version_date,
        });
        expect(historical?.chunk?.id).toBe(publication.chunk_id);
        expect(historical?.question_version.id).toBe(publication.version_id);
        expect(historical?.settings).toEqual(
          metadataVersions.find(
            (settings) => settings.question_version_id === publication.version_id,
          ),
        );
        expect(historical?.version_date).toBe(publication.version_date);
      }

      await fs.appendFile(
        path.join(courseDir, 'questions/addNumbers/server.py'),
        '\n# New code revision\n',
      );
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
        changedFiles: ['questions/addNumbers/server.py'],
      });
      const codeVersions = await sqldb.queryRows(
        sql.select_question_versions,
        { question_id: questionId },
        QuestionVersionSettingSchema,
      );
      expect(codeVersions).toHaveLength(3);
      expect(codeVersions[2]).toEqual({
        ...metadataVersions[1],
        question_version_id: codeVersions[2].question_version_id,
      });
    });

    it('resolves archives at the version date and reports missing archives', async () => {
      const courseDir = tempTestCourseDir.path;
      const courseData = await courseDB.loadFullCourse(course.id, courseDir);
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData,
      });
      const originalChunk = (await chunksLib.selectChunksForCourse(course.id)).find(
        (chunk) => chunk.question_id === questionId,
      )!;
      const originalDate = await sqldb.queryScalar(
        sql.select_chunk_creation_date,
        { chunk_id: originalChunk.id },
        z.string(),
      );
      const original = await selectOptionalQuestionVersionAtDate({
        question_id: questionId,
        at_date: originalDate,
      });
      assert(original !== null);

      // A forced archive refresh can preserve the same question content identity.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData,
        changedFiles: ['questions/addNumbers/server.py'],
      });
      const currentChunk = (await chunksLib.selectChunksForCourse(course.id)).find(
        (chunk) => chunk.question_id === questionId,
      )!;
      expect(currentChunk.id).not.toBe(originalChunk.id);
      const laterDate = await sqldb.queryScalar(
        sql.select_chunk_creation_date,
        { chunk_id: currentChunk.id },
        z.string(),
      );
      const later = await selectOptionalQuestionVersionAtDate({
        question_id: questionId,
        at_date: laterDate,
      });
      expect(later?.question_version.id).toBe(original.question_version.id);
      expect(later?.version_date).toBe(originalDate);
      expect(later?.chunk?.id).toBe(originalChunk.id);

      await sqldb.execute(sql.delete_chunk, { chunk_id: originalChunk.id });
      await expect(
        selectOptionalQuestionVersionAtDate({ question_id: questionId, at_date: laterDate }),
      ).rejects.toMatchObject({ name: 'QuestionHistoryUnavailableError' });
      const settings = await sqldb.queryRows(
        sql.select_question_versions,
        { question_id: questionId },
        QuestionVersionSettingSchema,
      );
      expect(settings).toEqual([original.settings]);
    });

    it('does not snapshot parsed question settings with validation errors', async () => {
      const courseDir = tempTestCourseDir.path;
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });
      const initialVersions = await sqldb.queryRows(
        sql.select_question_versions,
        { question_id: questionId },
        QuestionVersionSettingSchema,
      );
      const infoPath = path.join(courseDir, 'questions/addNumbers/info.json');
      const originalInfo = QuestionJsonSchema.parse(await fs.readJson(infoPath));
      await fs.writeJson(infoPath, { ...originalInfo, gradingMethod: 'External' });
      const { logger } = makeMockLogger();
      const invalidSync = await syncDiskToSql(course, logger);
      assert(invalidSync.status === 'complete');
      assert.isTrue(invalidSync.hadJsonErrors);
      const invalidQuestion = invalidSync.courseData.questions.addNumbers;
      assert.isDefined(invalidQuestion.data);
      assert.isNotEmpty(invalidQuestion.errors);
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: invalidSync.courseData,
        changedFiles: ['questions/addNumbers/info.json'],
      });
      const invalidVersions = await sqldb.queryRows(
        sql.select_question_versions,
        { question_id: questionId },
        QuestionVersionSettingSchema,
      );
      expect(invalidVersions).toEqual(initialVersions);

      await fs.writeJson(infoPath, originalInfo);
      const repairedSync = await syncDiskToSql(course, logger);
      assert(repairedSync.status === 'complete');
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: repairedSync.courseData,
        changedFiles: [],
      });
      const repairedVersions = await sqldb.queryRows(
        sql.select_question_versions,
        { question_id: questionId },
        QuestionVersionSettingSchema,
      );
      expect(repairedVersions).toHaveLength(2);
      expect(repairedVersions[0]).toEqual(initialVersions[0]);
    });

    it('publishes versions during chunk-enabled sync and rolls back incomplete publications', async () => {
      const { logger } = makeMockLogger();
      config.chunksGenerator = true;
      try {
        await syncDiskToSql(course, logger);
        const initialChunks = await chunksLib.selectChunksForCourse(course.id);
        const initialSettings = await sqldb.queryRows(
          sql.select_question_versions,
          { question_id: questionId },
          QuestionVersionSettingSchema,
        );
        expect(initialSettings).toHaveLength(1);

        await fs.appendFile(
          path.join(tempTestCourseDir.path, 'questions/addNumbers/server.py'),
          '\n# New revision\n',
        );
        await sqldb.execute(sql.reject_settings);
        try {
          await expect(syncDiskToSql(course, logger)).rejects.toThrow('reject_settings');
        } finally {
          await sqldb.execute(sql.allow_settings);
        }
        expect(await chunksLib.selectChunksForCourse(course.id)).toEqual(initialChunks);
        expect(
          await sqldb.queryRows(
            sql.select_question_versions,
            { question_id: questionId },
            QuestionVersionSettingSchema,
          ),
        ).toEqual(initialSettings);

        await syncDiskToSql(course, logger);
        const publications = await sqldb.queryRows(
          sql.select_question_publications,
          { question_id: questionId },
          z.object({
            version_date: z.string(),
            chunk_date: z.string(),
            version_id: IdSchema,
            chunk_id: IdSchema,
          }),
        );
        expect(publications).toHaveLength(2);
        for (const publication of publications) {
          expect(publication.version_date).toBe(publication.chunk_date);
        }

        const initialDependency = initialChunks.find(
          (chunk) => chunk.type === 'serverFilesCourse',
        )!;
        expect(
          (await chunksLib.selectChunksForCourse(course.id)).find(
            (chunk) => chunk.type === 'serverFilesCourse',
          )?.uuid,
        ).toBe(initialDependency.uuid);
        await fs.writeFile(
          path.join(tempTestCourseDir.path, 'serverFilesCourse/helper.py'),
          '# Dependency edit\n',
        );
        await syncDiskToSql(course, logger);
        const dependency = (await chunksLib.selectChunksForCourse(course.id)).find(
          (chunk) => chunk.type === 'serverFilesCourse',
        )!;
        expect(dependency.uuid).not.toBe(initialDependency.uuid);
        const withDependency = await sqldb.queryRows(
          sql.select_question_publications,
          { question_id: questionId },
          z.object({
            version_date: z.string(),
            chunk_date: z.string(),
            version_id: IdSchema,
            chunk_id: IdSchema,
          }),
        );
        expect(withDependency).toHaveLength(3);
        expect(new Date(withDependency[2].version_date)).toEqual(dependency.created_at);
      } finally {
        config.chunksGenerator = false;
      }
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
        id: course.id,
        path: courseDir,
      });

      // Generate chunks for the test course.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });

      const chunksToLoad: chunksLib.Chunk[] = [{ type: 'question', questionId }];

      // Load the question's chunk.
      await chunksLib.ensureChunksForCourseAsync(course.id, chunksToLoad);

      // Move the question. We can't directly move a directory to a subdirectory
      // of itself, so we move it to a temporary location first.
      const oldPath = path.join(courseDir, 'questions', 'addNumbers');
      const tempPath = path.join(courseDir, 'questions', 'addNumbersTemp');
      const newPath = path.join(courseDir, 'questions', 'addNumbers', 'addNumbersNested');
      await fs.move(oldPath, tempPath);
      await fs.move(tempPath, newPath);

      // Sync course to DB.
      const { logger } = makeMockLogger();
      await syncDiskToSql(course, logger);

      // Regenerate chunks.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });

      // Reload chunks.
      await chunksLib.ensureChunksForCourseAsync(course.id, chunksToLoad);

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
        id: course.id,
        path: courseDir,
      });

      // Generate chunks for the test course.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });

      const chunksToLoad: chunksLib.Chunk[] = [{ type: 'question', questionId: nestedQuestionId }];

      // Load the question's chunk.
      await chunksLib.ensureChunksForCourseAsync(course.id, chunksToLoad);

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
      await syncDiskToSql(course, logger);

      // Regenerate chunks.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });

      // Reload chunks.
      await chunksLib.ensureChunksForCourseAsync(course.id, chunksToLoad);

      // Check that the chunk was written to the correct location.
      assert.isOk(
        await fs.pathExists(path.join(courseRuntimeDir, 'questions', 'subfolder', 'info.json')),
      );
    });

    it('rebuilds both chunks when a file is renamed across chunk boundaries', async () => {
      const courseDir = tempTestCourseDir.path;
      const courseRuntimeDir = chunksLib.getRuntimeDirectoryForCourse({
        id: course.id,
        path: courseDir,
      });
      const questionFilePath = path.join(courseDir, 'questions', 'addNumbers', 'helper.py');
      const serverFilePath = path.join(courseDir, 'serverFilesCourse', 'helper.py');

      await fs.writeFile(questionFilePath, 'def get_value():\n    return 42\n');
      await execa('git', ['init'], { cwd: courseDir });
      await execa('git', ['config', 'diff.renames', 'true'], { cwd: courseDir });
      await execa('git', ['config', 'user.email', 'test@example.com'], { cwd: courseDir });
      await execa('git', ['config', 'user.name', 'Test User'], { cwd: courseDir });
      await execa('git', ['add', '-A'], { cwd: courseDir });
      await execa('git', ['commit', '-m', 'Initial course'], { cwd: courseDir });
      const oldHash = (await execa('git', ['rev-parse', 'HEAD'], { cwd: courseDir })).stdout;

      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });
      const chunksToLoad: chunksLib.Chunk[] = [
        { type: 'question', questionId },
        { type: 'serverFilesCourse' },
      ];
      await chunksLib.ensureChunksForCourseAsync(course.id, chunksToLoad);

      const runtimeQuestionFilePath = path.join(
        courseRuntimeDir,
        'questions',
        'addNumbers',
        'helper.py',
      );
      const runtimeServerFilePath = path.join(courseRuntimeDir, 'serverFilesCourse', 'helper.py');
      assert.isOk(await fs.pathExists(runtimeQuestionFilePath));
      assert.isNotOk(await fs.pathExists(runtimeServerFilePath));

      await fs.move(questionFilePath, serverFilePath);
      await execa('git', ['add', '-A'], { cwd: courseDir });
      await execa('git', ['commit', '-m', 'Move helper to server files'], { cwd: courseDir });
      const newHash = (await execa('git', ['rev-parse', 'HEAD'], { cwd: courseDir })).stdout;
      const { stdout: nameStatus } = await execa(
        'git',
        ['diff', '--name-status', '--find-renames=100%', oldHash, newHash],
        { cwd: courseDir },
      );
      assert.equal(nameStatus, 'R100\tquestions/addNumbers/helper.py\tserverFilesCourse/helper.py');

      const { logger } = makeMockLogger();
      await syncDiskToSql(course, logger);
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
        oldHash,
        newHash,
      });
      await chunksLib.ensureChunksForCourseAsync(course.id, chunksToLoad);

      assert.isOk(await fs.pathExists(runtimeServerFilePath));
      assert.isNotOk(await fs.pathExists(runtimeQuestionFilePath));
    });

    it('deletes chunks that are no longer needed', async () => {
      const courseDir = tempTestCourseDir.path;
      const courseRuntimeDir = chunksLib.getRuntimeDirectoryForCourse({
        id: course.id,
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
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });

      // Load and unpack chunks
      await chunksLib.ensureChunksForCourseAsync(course.id, chunksToLoad);

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
      await syncDiskToSql(course, logger);

      // Regenerate chunks
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });

      // Reload the chunks
      await chunksLib.ensureChunksForCourseAsync(course.id, chunksToLoad);

      // Assert that the chunks have been removed from disk
      assert.isNotOk(await fs.pathExists(path.join(courseRuntimeDir, 'elements')));
      assert.isNotOk(await fs.pathExists(path.join(courseRuntimeDir, 'elementExtensions')));

      // Assert that the chunks are absent from the current state
      let databaseChunks = await chunksLib.selectChunksForCourse(course.id);
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
      await syncDiskToSql(course, logger);

      // Regenerate chunks
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });

      // Reload the chunks
      await chunksLib.ensureChunksForCourseAsync(course.id, chunksToLoad);

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

      // Assert that the remaining chunks are absent from the current state
      databaseChunks = await chunksLib.selectChunksForCourse(course.id);
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

    // See https://github.com/PrairieLearn/PrairieLearn/issues/12873
    it('creates clientFilesCourseInstance chunk for new course instance id after UUID change', async () => {
      const courseDir = tempTestCourseDir.path;

      // Generate initial chunks for the test course.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });

      // Verify that an initial chunk exists for this course instance.
      let databaseChunks = await chunksLib.selectChunksForCourse(course.id);
      assert.isOk(
        databaseChunks.find(
          (chunk) =>
            chunk.type === 'clientFilesCourseInstance' &&
            chunk.course_instance_id === courseInstanceId,
        ),
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
      await syncDiskToSql(course, logger);

      // Fetch the (new) course instance ID by long_name; this should now differ from the previous id
      const newCourseInstanceId = await sqldb.queryScalar(
        sql.select_course_instance,
        { long_name: 'Spring 2015' },
        IdSchema,
      );
      assert.notEqual(newCourseInstanceId, courseInstanceId);

      // Regenerate chunks. After the fix, this should create a new chunk for newCourseInstanceId
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });

      // Re-read chunks from DB
      databaseChunks = await chunksLib.selectChunksForCourse(course.id);

      assert.isUndefined(
        databaseChunks.find(
          (chunk) =>
            chunk.type === 'clientFilesCourseInstance' &&
            chunk.course_instance_id === courseInstanceId,
        ),
      );
      // A chunk should exist for the new course instance id.
      assert.isOk(
        databaseChunks.find(
          (chunk) =>
            chunk.type === 'clientFilesCourseInstance' &&
            chunk.course_instance_id === newCourseInstanceId,
        ),
      );
    });

    // This tests a scenario where a new course instance is created with an invalid
    // JSON file and a client file. We want to assert that we don't lose changes to
    // client files as the course instance is fixed up.
    it('correctly handles clientFilesCourseInstance chunk when initial course instance is invalid', async () => {
      const courseDir = tempTestCourseDir.path;

      const courseInstancePath = path.join(courseDir, 'courseInstances', 'new');

      // Write an empty (invalid) JSON file for the new course instance.
      const infoCourseInstancePath = path.join(courseInstancePath, 'infoCourseInstance.json');
      await fs.outputFile(infoCourseInstancePath, '');

      // Write a new course instance client file with known contents.
      const clientFilePath = path.join(courseInstancePath, 'clientFilesCourseInstance', 'test.txt');
      await fs.outputFile(clientFilePath, 'Original contents');

      // Sync course to DB so that the new course instance is inserted.
      const { logger } = makeMockLogger();
      await syncDiskToSql(course, logger);

      // Get the new course instance.
      const courseInstance = await selectCourseInstanceByShortName({
        course: await selectCourseById(course.id),
        shortName: 'new',
      });

      // Generate new chunks.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
        changedFiles: [
          path.relative(courseDir, infoCourseInstancePath),
          path.relative(courseDir, clientFilePath),
        ],
      });

      // Verify that a chunk exists for this course instance.
      const databaseChunks = await chunksLib.selectChunksForCourse(course.id);
      assert.isOk(
        databaseChunks.find(
          (chunk) =>
            chunk.type === 'clientFilesCourseInstance' &&
            chunk.course_instance_id === courseInstance.id,
        ),
      );

      // Load the chunk.
      const chunksToLoad: chunksLib.Chunk[] = [
        {
          type: 'clientFilesCourseInstance',
          courseInstanceId: courseInstance.id,
        },
      ];
      await chunksLib.ensureChunksForCourseAsync(course.id, chunksToLoad);

      const courseRuntimeDir = chunksLib.getRuntimeDirectoryForCourse({
        id: course.id,
        path: courseDir,
      });

      // Verify that the course instance client file exists and has the expected contents.
      const runtimeClientFilePath = path.join(
        courseRuntimeDir,
        'courseInstances',
        'new',
        'clientFilesCourseInstance',
        'test.txt',
      );
      assert.isOk(await fs.pathExists(runtimeClientFilePath));
      let contents = await fs.readFile(runtimeClientFilePath, 'utf-8');
      assert.equal(contents, 'Original contents');

      // Change the contents of the client file.
      await fs.outputFile(clientFilePath, 'Changed contents');

      // Regenerate chunks.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
        changedFiles: [path.relative(courseDir, clientFilePath)],
      });

      // Load the chunk again.
      await chunksLib.ensureChunksForCourseAsync(course.id, chunksToLoad);

      // Verify that the course instance client file has the updated contents.
      assert.isOk(await fs.pathExists(runtimeClientFilePath));
      contents = await fs.readFile(runtimeClientFilePath, 'utf-8');
      assert.equal(contents, 'Changed contents');

      // Now fix up the infoCourseInstance.json file so that it's valid.
      const infoCiJson = {
        uuid: '33333333-3333-4333-8333-333333333333',
        longName: 'New Course Instance',
      };
      await fs.writeJson(infoCourseInstancePath, infoCiJson, { spaces: 2 });

      // Sync course to DB so that the course_instance row is updated.
      await syncDiskToSql(course, logger);

      // Assert that we produced a course instance without sync errors/warnings.
      const newCourseInstance = await selectCourseInstanceByShortName({
        course: await selectCourseById(course.id),
        shortName: 'new',
      });
      assert.equal(newCourseInstance.id, courseInstance.id);
      expect(newCourseInstance.sync_errors).toBeFalsy();
      expect(newCourseInstance.sync_warnings).toBeFalsy();

      // Regenerate chunks.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
        changedFiles: [path.relative(courseDir, infoCourseInstancePath)],
      });

      // Load the chunk again.
      await chunksLib.ensureChunksForCourseAsync(course.id, chunksToLoad);

      // Verify that the course instance client file still exists and has the expected contents.
      assert.isOk(await fs.pathExists(runtimeClientFilePath));
      contents = await fs.readFile(runtimeClientFilePath, 'utf-8');
      assert.equal(contents, 'Changed contents');
    });

    // See https://github.com/PrairieLearn/PrairieLearn/issues/12873
    it('creates clientFilesAssessment chunk for new assessment id after UUID change', async () => {
      const courseDir = tempTestCourseDir.path;

      // Generate initial chunks for the test course.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });

      // Verify that an initial chunk exists for this assessment.
      let databaseChunks = await chunksLib.selectChunksForCourse(course.id);
      assert.isOk(
        databaseChunks.find(
          (chunk) => chunk.type === 'clientFilesAssessment' && chunk.assessment_id === assessmentId,
        ),
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
      await syncDiskToSql(course, logger);

      // Fetch the (new) assessment ID by TID; this should now differ from the previous id
      const newAssessmentId = await sqldb.queryScalar(
        sql.select_assessment,
        { tid: 'exam1-automaticTestSuite' },
        IdSchema,
      );
      assert.notEqual(newAssessmentId, assessmentId);

      // Regenerate chunks. Current buggy behavior: this will NOT create a new chunk for newAssessmentId
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });

      // Re-read chunks from DB
      databaseChunks = await chunksLib.selectChunksForCourse(course.id);

      assert.isUndefined(
        databaseChunks.find(
          (chunk) => chunk.type === 'clientFilesAssessment' && chunk.assessment_id === assessmentId,
        ),
      );
      // After the fix: a chunk should exist for the new assessment id.
      // Today (pre-fix): this assertion will fail because we don't regenerate the chunk.
      assert.isOk(
        databaseChunks.find(
          (chunk) =>
            chunk.type === 'clientFilesAssessment' && chunk.assessment_id === newAssessmentId,
        ),
      );
    });

    it('preserves relative symlinks with .. in serverFilesCourse', async () => {
      const courseDir = tempTestCourseDir.path;
      const courseRuntimeDir = chunksLib.getRuntimeDirectoryForCourse({
        id: course.id,
        path: courseDir,
      });

      // Create a serverFilesCourse directory with a file and a symlink that uses ..
      const serverFilesDir = path.join(courseDir, 'serverFilesCourse');
      const libDir = path.join(serverFilesDir, 'lib');
      const utilsDir = path.join(serverFilesDir, 'utils');

      await fs.ensureDir(libDir);
      await fs.ensureDir(utilsDir);

      // Create a shared file in lib/
      const sharedFilePath = path.join(libDir, 'shared.py');
      await fs.writeFile(sharedFilePath, '# Shared library code\n');

      // Create a symlink in utils/ that points to ../lib/shared.py
      const symlinkPath = path.join(utilsDir, 'shared.py');
      await fs.symlink('../lib/shared.py', symlinkPath);

      // Verify the symlink was created correctly
      const originalLinkTarget = await fs.readlink(symlinkPath);
      assert.equal(originalLinkTarget, '../lib/shared.py');

      // Generate chunks for the test course
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });

      // Load and unpack the serverFilesCourse chunk
      const chunksToLoad: chunksLib.Chunk[] = [{ type: 'serverFilesCourse' }];
      await chunksLib.ensureChunksForCourseAsync(course.id, chunksToLoad);

      // Verify the symlink exists in the unpacked chunk and has the correct target
      const unpackedSymlinkPath = path.join(
        courseRuntimeDir,
        'serverFilesCourse',
        'utils',
        'shared.py',
      );
      const stat = await fs.lstat(unpackedSymlinkPath);
      assert.isTrue(stat.isSymbolicLink(), 'Expected a symlink at utils/shared.py');

      const unpackedLinkTarget = await fs.readlink(unpackedSymlinkPath);
      assert.equal(unpackedLinkTarget, '../lib/shared.py', 'Symlink target should be preserved');

      // Also verify the symlink resolves to the correct file
      const resolvedContent = await fs.readFile(unpackedSymlinkPath, 'utf-8');
      assert.equal(resolvedContent, '# Shared library code\n');
    });

    it('no-op update does not create duplicate chunks when IDs unchanged', async () => {
      const courseDir = tempTestCourseDir.path;

      // Generate initial chunks for the test course.
      await chunksLib.updateChunksForCourse({
        coursePath: courseDir,
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });

      // Capture baseline chunk set and counts
      const initialChunks = await chunksLib.selectChunksForCourse(course.id);
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
        courseId: course.id,
        courseData: await courseDB.loadFullCourse(course.id, courseDir),
      });

      // Fetch again and ensure counts are unchanged
      const afterChunks = await chunksLib.selectChunksForCourse(course.id);
      expect(new Set(afterChunks.map((chunk) => chunk.id))).toEqual(
        new Set(initialChunks.map((chunk) => chunk.id)),
      );
      const afterCount = afterChunks.length;
      assert.equal(afterCount, initialCount);

      const afterCourseCount = afterChunks.filter((c) => c.type === 'clientFilesCourse').length;
      const afterCiCount = afterChunks.filter(
        (c) => c.type === 'clientFilesCourseInstance' && c.course_instance_id === courseInstanceId,
      ).length;
      const afterAssessCount = afterChunks.filter(
        (c) => c.type === 'clientFilesAssessment' && c.assessment_id === assessmentId,
      ).length;

      assert.equal(afterCourseCount, initialCourseCount);
      assert.equal(afterCiCount, initialCiCount);
      assert.equal(afterAssessCount, initialAssessCount);
    });
  });
});
