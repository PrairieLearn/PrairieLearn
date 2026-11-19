import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';
import {
  afterAll,
  afterEach,
  assert,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { b64EncodeUnicode } from '../lib/base64-util.js';
import * as chunks from '../lib/chunks.js';
import { config } from '../lib/config.js';
import { pullAndUpdateCourse } from '../lib/course.js';
import {
  AssessmentQuestionSchema,
  AssessmentSchema,
  ChunkSchema,
  QuestionSchema,
  type User,
} from '../lib/db-types.js';
import { getOriginalHash } from '../lib/editorUtil.js';
import { FileModifyEditor, classifyEditOutcome } from '../lib/editors.js';
import { features } from '../lib/features/index.js';
import { selectJobsByJobSequenceId } from '../lib/server-jobs.js';
import { selectAssessmentQuestionByQuestionId } from '../models/assessment-question.js';
import * as courseModel from '../models/course.js';
import { getCourseCommitHash, selectCourseById, updateCourseColumn } from '../models/course.js';
import { selectQuestionByQid, updateQuestion } from '../models/question.js';
import { selectOrInsertUserByUid } from '../models/user.js';
import { assessmentDependenciesRequireFullSync } from '../sync/assessmentDependencies.js';
import * as courseDB from '../sync/course-db.js';

import {
  type CourseRepoFixture,
  commitOriginAndSync,
  createCourseRepoFixture,
} from './helperCourse.js';
import * as helperDb from './helperDb.js';
import * as util from './sync/util.js';
import { withConfig } from './utils/config.js';

const sql = loadSqlEquiv(import.meta.url);

describe('content-only question save', () => {
  const qid = 'nested/question';
  const originContents = '<p>Original</p>';
  const chunksConsumerDirectory = config.chunksConsumerDirectory;
  let fixture: CourseRepoFixture;
  let courseId: string;
  let courseDir: string;
  let filePath: string;
  let user: User;

  beforeAll(helperDb.before);
  afterAll(helperDb.after);
  afterEach(async () => {
    vi.restoreAllMocks();
    config.chunksConsumerDirectory = chunksConsumerDirectory;
    await fs.remove(fixture.baseDir);
  });
  beforeEach(async () => {
    await helperDb.resetDatabase();
    await features.enable('partial-course-sync');
    config.fileEditorUseGit = true;
    config.chunksGenerator = true;
    config.chunksConsumer = false;
    const data = util.getCourseData();
    data.questions[qid] = { ...data.questions[util.QUESTION_ID], uuid: randomUUID() };
    fixture = await createCourseRepoFixture({
      populateOrigin: async (directory) => {
        await util.writeCourseToDirectory(data, directory);
        await fs.writeFile(path.join(directory, 'questions', qid, 'question.html'), originContents);
        await fs.writeFile(
          path.join(directory, 'questions', util.QUESTION_ID, 'question.html'),
          originContents,
        );
      },
    });
    courseDir = fixture.courseLiveDir;
    const result = await util.syncCourseData(courseDir);
    courseId = result.courseId;
    filePath = path.join(courseDir, 'questions', qid, 'question.html');
    user = await selectOrInsertUserByUid('editor@example.com');
    await sync();
  });

  async function save(targetPath = filePath, content = '<p>Updated</p>') {
    const course = await selectCourseById(courseId);
    const editor = new FileModifyEditor({
      locals: { course, user, authz_data: { has_course_permission_edit: true, authn_user: user } },
      container: { rootPath: courseDir, invalidRootPaths: [] },
      filePath: targetPath,
      editContents: b64EncodeUnicode(content),
      origHash: (await getOriginalHash(targetPath))!,
    });
    const job = await editor.prepareServerJob();
    return {
      editor,
      run: (options?: Parameters<FileModifyEditor['executeWithServerJob']>[1]) =>
        editor.executeWithServerJob(job, options),
      result: async () => (await selectJobsByJobSequenceId(job.jobSequenceId))[0],
    };
  }

  async function sync() {
    const { jobPromise } = await pullAndUpdateCourse({
      course: await selectCourseById(courseId),
      userId: user.id,
      authnUserId: user.id,
    });
    return await jobPromise;
  }

  it('uses full sync by default for saves and pulls and allows partial sync only while enabled', async () => {
    await features.delete('partial-course-sync');
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const partial = vi.spyOn(chunks, 'prepareQuestionContentChunks');
    await (await save()).run();
    expect(load).toHaveBeenCalledOnce();
    expect(partial).not.toHaveBeenCalled();
    load.mockClear();
    await sync();
    expect(load).toHaveBeenCalledOnce();

    const course = await selectCourseById(courseId);
    const context = { course_id: courseId, institution_id: course.institution_id };
    await features.enable('partial-course-sync', context);
    load.mockClear();
    await (await save(filePath, '<p>Enabled</p>')).run();
    expect(load).not.toHaveBeenCalled();
    expect(partial).toHaveBeenCalledOnce();

    await features.disable('partial-course-sync', context);
    partial.mockClear();
    await (await save(filePath, '<p>Disabled again</p>')).run();
    expect(load).toHaveBeenCalledOnce();
    expect(partial).not.toHaveBeenCalled();
    assert.equal(await fs.readFile(filePath, 'utf8'), '<p>Disabled again</p>');
    assert.equal(
      (await selectCourseById(courseId)).commit_hash,
      await getCourseCommitHash(courseDir),
    );
  });

  it('establishes the sync configuration, reprocesses version changes without Git changes, and returns to partial sync', async () => {
    await courseModel.updateCourseSyncConfiguration(courseId, null);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    await sync();
    expect(load).toHaveBeenCalledOnce();
    const initial = await selectCourseById(courseId);
    assert.isNotNull(initial.sync_configuration);
    load.mockClear();

    await courseModel.updateCourseSyncConfiguration(courseId, {
      ...initial.sync_configuration,
      version: 0,
    });
    await sync();
    expect(load).toHaveBeenCalledOnce();
    const refreshed = await selectCourseById(courseId);
    assert.equal(refreshed.commit_hash, initial.commit_hash);
    assert.deepEqual(refreshed.sync_configuration, initial.sync_configuration);
    load.mockClear();
    await (await save()).run();
    expect(load).not.toHaveBeenCalled();

    await util.syncCourseData(courseDir);
    assert.isNull((await selectCourseById(courseId)).sync_configuration);
  });

  it('revalidates sharing on feature changes and keeps recorded JSON errors without repeatedly doing full sync', async () => {
    const infoPath = path.join(fixture.courseOriginDir, 'questions', qid, 'info.json');
    const info = await fs.readJson(infoPath);
    await fs.writeJson(infoPath, { ...info, sharePublicly: true });
    await commitOriginAndSync(fixture, 'Make question public');
    await withConfig(
      {
        checkSharingOnSync: true,
        features: { 'question-sharing': true, 'consume-public-questions': false },
      },
      async () => {
        await sync();
        assert.isNull((await selectQuestionByQid({ course_id: courseId, qid })).sync_errors);
        const load = vi.spyOn(courseDB, 'loadFullCourse');
        await withConfig({ features: { 'question-sharing': false } }, async () => {
          await sync();
          expect(load).toHaveBeenCalledOnce();
          const question = await selectQuestionByQid({ course_id: courseId, qid });
          assert.include(question.sync_errors!, 'sharing is not enabled');
          const processed = await selectCourseById(courseId);
          assert.deepEqual(processed.sync_configuration?.features, {
            'question-sharing': false,
            'consume-public-questions': false,
          });
          load.mockClear();
          await sync();
          expect(load).not.toHaveBeenCalled();
          assert.deepEqual(await selectQuestionByQid({ course_id: courseId, qid }), question);
        });
        await sync();
        assert.isNull((await selectQuestionByQid({ course_id: courseId, qid })).sync_errors);
      },
    );
  });

  it('reloads prepared metadata when sharing changes during the push', async () => {
    const originInfoPath = path.join(fixture.courseOriginDir, 'questions', qid, 'info.json');
    const info = await fs.readJson(originInfoPath);
    await fs.writeJson(originInfoPath, { ...info, sharePublicly: true });
    await commitOriginAndSync(fixture, 'Make question public');
    await withConfig({ checkSharingOnSync: true }, async () => {
      const course = await selectCourseById(courseId);
      await features.enable('question-sharing', { institution_id: course.institution_id });
      await sync();
      const load = vi.spyOn(courseDB, 'loadFullCourse');
      const operation = await save(
        path.join(path.dirname(filePath), 'info.json'),
        JSON.stringify({ ...info, sharePublicly: true, title: 'Changed title' }),
      );
      await expect(
        operation.run({
          beforeWrite: async (job) => {
            const exec = job.exec.bind(job);
            vi.spyOn(job, 'exec').mockImplementation(async (file, args, options) => {
              const result = await exec(file, args, options);
              if (file === 'git' && args[0] === 'push') {
                await features.disable('question-sharing', {
                  institution_id: course.institution_id,
                });
              }
              return result;
            });
          },
        }),
      ).rejects.toThrow('One or more JSON files contained errors');
      expect(load).toHaveBeenCalledTimes(2);
      const question = await selectQuestionByQid({ course_id: courseId, qid });
      assert.equal(question.title, info.title);
      assert.include(question.sync_errors!, 'sharing is not enabled');
      expect((await selectCourseById(courseId)).sync_configuration?.features).toMatchObject({
        'question-sharing': false,
      });
    });
  });

  it('rebuilds chunks on activation but preserves chunk revisions when only processing settings change', async () => {
    await withConfig({ chunksGenerator: false }, async () => {
      await sync();
      await withConfig({ chunksGenerator: true }, async () => {
        const full = vi.spyOn(chunks, 'prepareChunksForCourse');
        await sync();
        expect(full.mock.calls[0][0].regenerateAll).toBe(true);
        const before = await util.dumpTableWithSchema('chunks', ChunkSchema);
        assert.isAbove(before.length, 0);
        full.mockClear();
        await withConfig(
          { externalGradingMaximumTimeout: config.externalGradingMaximumTimeout + 1 },
          async () => {
            await sync();
            expect(full.mock.calls[0][0].regenerateAll).toBe(false);
            assert.deepEqual(await util.dumpTableWithSchema('chunks', ChunkSchema), before);
          },
        );
      });
    });
  });

  it('saves nested-question content and publishes only its chunk without loading course metadata', async () => {
    config.chunksGenerator = true;
    config.chunksConsumer = true;
    config.chunksConsumerDirectory = path.join(fixture.baseDir, 'runtime');
    const before = await chunks.selectChunksForCourse(courseId);
    const question = await selectQuestionByQid({ course_id: courseId, qid });
    const targeted = vi.spyOn(chunks, 'prepareQuestionContentChunks');
    const full = vi.spyOn(chunks, 'prepareChunksForCourse');
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const metadataBefore = await util.dumpTableWithSchema('questions', QuestionSchema);
    const operation = await save();
    await operation.run();
    assert.equal(await fs.readFile(filePath, 'utf8'), '<p>Updated</p>');
    expect(load).not.toHaveBeenCalled();
    expect(targeted).toHaveBeenCalledExactlyOnceWith({
      coursePath: courseDir,
      courseId,
      qids: [qid],
    });
    expect((await targeted.mock.results[0].value).changes).toEqual({
      updatedChunks: [{ type: 'question', questionName: qid }],
      deletedChunks: [],
      replacedChunkIds: [before.find((chunk) => chunk.question_id === question.id)!.id],
    });
    expect(full).not.toHaveBeenCalled();
    assert.deepEqual(await util.dumpTableWithSchema('questions', QuestionSchema), metadataBefore);
    assert.equal(classifyEditOutcome((await operation.result()).data), 'success');
    assert.equal(
      (await selectCourseById(courseId)).commit_hash,
      await getCourseCommitHash(courseDir),
    );

    const after = await chunks.selectChunksForCourse(courseId);
    assert.lengthOf(after, before.length);
    const updated = after.find((chunk) => chunk.question_id === question.id)!;
    assert.equal(updated.commit_hash, await getCourseCommitHash(courseDir));
    assert.isAbove(updated.size_compressed!, 0);
    assert.isAbove(updated.size_uncompressed!, 0);
    assert.notEqual(
      after.find((chunk) => chunk.question_id === question.id)!.uuid,
      before.find((chunk) => chunk.question_id === question.id)!.uuid,
    );
    assert.deepEqual(
      after.filter((chunk) => chunk.question_id !== question.id),
      before.filter((chunk) => chunk.question_id !== question.id),
    );
    await chunks.ensureChunksForCourseAsync(courseId, {
      type: 'question',
      questionId: question.id,
    });
    const runtimePath = chunks.getRuntimeDirectoryForCourse({ id: courseId, path: courseDir });
    assert.equal(
      await fs.readFile(path.join(runtimePath, 'questions', qid, 'question.html'), 'utf8'),
      '<p>Updated</p>',
    );
  });

  it.each(['unknown revision', 'unexpected change', 'symlink'])(
    'uses full sync for %s',
    async (reason) => {
      if (reason === 'unknown revision') {
        await execute(sql.set_commit_hash, { courseId, hash: '0'.repeat(40) });
      }
      if (reason === 'symlink') {
        await fs.symlink(
          'infoCourse.json',
          path.join(fixture.courseOriginDir, 'metadata-alias.json'),
        );
        await commitOriginAndSync(fixture, 'Add metadata symlink');
        await sync();
      }
      const load = vi.spyOn(courseDB, 'loadFullCourse');
      const operation = await save();
      if (reason === 'unexpected change') {
        const write = operation.editor.write.bind(operation.editor);
        vi.spyOn(operation.editor, 'write').mockImplementation(async () => {
          const result = await write();
          assert.isNotNull(result);
          const courseInfoPath = path.join(courseDir, 'infoCourse.json');
          const info = await fs.readJson(courseInfoPath);
          await fs.writeJson(courseInfoPath, { ...info, title: 'Unexpected course edit' });
          result.pathsToAdd.push(courseInfoPath);
          return result;
        });
      }
      await operation.run();
      expect(load).toHaveBeenCalled();
      assert.equal(classifyEditOutcome((await operation.result()).data), 'success');
    },
  );

  it('restores missing content before checking eligibility and still uses content-only sync', async () => {
    const operation = await save();
    await fs.remove(filePath);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    await operation.run();
    assert.equal(await fs.readFile(filePath, 'utf8'), '<p>Updated</p>');
    expect(load).not.toHaveBeenCalled();
    assert.equal(classifyEditOutcome((await operation.result()).data), 'success');
  });

  it('fully syncs question metadata and preserves JSON errors during content saves', async () => {
    const jsonPath = path.join(path.dirname(filePath), 'info.json');
    const info = await fs.readJson(jsonPath);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const operation = await save(jsonPath, JSON.stringify({ ...info, title: 'Changed title' }));
    await operation.run();
    expect(load).toHaveBeenCalledOnce();
    assert.equal((await selectQuestionByQid({ course_id: courseId, qid })).title, 'Changed title');

    load.mockClear();
    const invalid = await save(jsonPath, 'invalid JSON');
    await expect(invalid.run()).rejects.toThrow('One or more JSON files contained errors');
    expect(load).toHaveBeenCalledOnce();
    assert.isNotNull((await selectQuestionByQid({ course_id: courseId, qid })).sync_errors);
    assert.equal(classifyEditOutcome((await invalid.result()).data), 'sync_json_errors');
    const withErrors = await selectQuestionByQid({ course_id: courseId, qid });
    load.mockClear();
    const content = await save();
    await content.run();
    expect(load).not.toHaveBeenCalled();
    assert.deepEqual(await selectQuestionByQid({ course_id: courseId, qid }), withErrors);
  });

  it('refreshes eligibility after acquiring the lock instead of trusting the request snapshot', async () => {
    const operation = await save();
    await execute(sql.set_commit_hash, { courseId, hash: null });
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    await operation.run();
    expect(load).toHaveBeenCalled();
  });

  it('rejects a changed course directory before mutation', async () => {
    const operation = await save();
    const newCoursePath = path.join(fixture.baseDir, 'moved');
    const newFilePath = path.join(newCoursePath, 'questions', qid, 'question.html');
    await fs.outputFile(newFilePath, '<p>New directory content</p>');
    await updateCourseColumn({
      courseId,
      columnName: 'path',
      value: newCoursePath,
      authnUserId: user.id,
    });
    const load = vi.spyOn(courseDB, 'loadFullCourse');

    await expect(operation.run()).rejects.toThrow(
      'The course directory changed. Reload the page before saving.',
    );

    assert.equal(await fs.readFile(filePath, 'utf8'), originContents);
    assert.equal(await fs.readFile(newFilePath, 'utf8'), '<p>New directory content</p>');
    const job = await operation.result();
    assert.notInclude(job.output, 'Command:');
    expect(load).not.toHaveBeenCalled();
    assert.equal(classifyEditOutcome(job.data), 'save_failed');
  });

  it('uses full sync after incorporating remote changes during push recovery', async () => {
    const remoteInfoPath = path.join(
      fixture.courseDevDir,
      'questions',
      util.QUESTION_ID,
      'info.json',
    );
    const info = await fs.readJson(remoteInfoPath);
    await fs.writeJson(remoteInfoPath, { ...info, title: 'Remote title' });
    await execa('git', ['add', remoteInfoPath], { cwd: fixture.courseDevDir });
    await execa('git', ['commit', '-m', 'Edit another question remotely'], {
      cwd: fixture.courseDevDir,
    });
    await execa('git', ['push'], { cwd: fixture.courseDevDir });
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const operation = await save();
    await operation.run();
    expect(load).toHaveBeenCalled();
    assert.equal(
      (await selectQuestionByQid({ course_id: courseId, qid: util.QUESTION_ID })).title,
      'Remote title',
    );
    assert.equal(await fs.readFile(filePath, 'utf8'), '<p>Updated</p>');
    assert.equal(classifyEditOutcome((await operation.result()).data), 'success');
  });

  it('syncs the restored remote metadata when the second push fails', async () => {
    const remotePath = path.join(fixture.courseDevDir, 'questions', util.QUESTION_ID, 'info.json');
    const remoteInfo = await fs.readJson(remotePath);
    await fs.writeJson(remotePath, { ...remoteInfo, title: 'Remote title' });
    await execa('git', ['add', remotePath], { cwd: fixture.courseDevDir });
    await execa('git', ['commit', '-m', 'Remote metadata edit'], { cwd: fixture.courseDevDir });
    await execa('git', ['push'], { cwd: fixture.courseDevDir });
    const infoPath = path.join(path.dirname(filePath), 'info.json');
    const original = await fs.readJson(infoPath);
    const operation = await save(
      infoPath,
      JSON.stringify({ ...original, title: 'Unpublished title' }),
    );
    let installed = false;
    await expect(
      operation.run({
        beforeWrite: async (job) => {
          if (installed) return;
          installed = true;
          const exec = job.exec.bind(job);
          let pushes = 0;
          vi.spyOn(job, 'exec').mockImplementation(async (file, args, options) => {
            if (file === 'git' && args[0] === 'push' && ++pushes === 2) {
              throw new Error('Retry push failed');
            }
            return await exec(file, args, options);
          });
        },
      }),
    ).rejects.toThrow('Retry push failed');
    assert.equal((await fs.readJson(infoPath)).title, original.title);
    assert.equal((await selectQuestionByQid({ course_id: courseId, qid })).title, original.title);
    assert.equal(
      (await selectQuestionByQid({ course_id: courseId, qid: util.QUESTION_ID })).title,
      'Remote title',
    );
    assert.equal(
      (await selectCourseById(courseId)).commit_hash,
      await getCourseCommitHash(courseDir),
    );
  });

  it('recovers both question chunks when another question is edited after an upload failure', async () => {
    config.chunksGenerator = true;
    const previousCommit = (await selectCourseById(courseId)).commit_hash;
    const upload = vi
      .spyOn(chunks, 'prepareQuestionContentChunks')
      .mockRejectedValueOnce(new Error('Upload failed'));
    const operation = await save();
    await expect(operation.run()).rejects.toThrow('Upload failed');
    assert.equal(classifyEditOutcome((await operation.result()).data), 'sync_failed');
    assert.equal((await selectCourseById(courseId)).commit_hash, previousCommit);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const next = await save(
      path.join(courseDir, 'questions', util.QUESTION_ID, 'question.html'),
      '<p>Another question</p>',
    );
    await next.run();
    expect(load).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(2);
    config.chunksConsumer = true;
    config.chunksConsumerDirectory = path.join(fixture.baseDir, 'runtime');
    for (const [questionQid, content] of [
      [qid, '<p>Updated</p>'],
      [util.QUESTION_ID, '<p>Another question</p>'],
    ]) {
      const question = await selectQuestionByQid({ course_id: courseId, qid: questionQid });
      await chunks.ensureChunksForCourseAsync(courseId, {
        type: 'question',
        questionId: question.id,
      });
      const runtime = chunks.getRuntimeDirectoryForCourse({ id: courseId, path: courseDir });
      assert.equal(
        await fs.readFile(path.join(runtime, 'questions', questionQid, 'question.html'), 'utf8'),
        content,
      );
    }
    assert.equal(
      (await selectCourseById(courseId)).commit_hash,
      await getCourseCommitHash(courseDir),
    );
  });

  it('replans supported changes from another question after push recovery', async () => {
    const beforeChunks = await chunks.selectChunksForCourse(courseId);
    const remote = path.join(fixture.courseDevDir, 'questions', util.QUESTION_ID, 'question.html');
    await fs.writeFile(remote, '<p>Remote content</p>');
    await execa('git', ['add', remote], { cwd: fixture.courseDevDir });
    await execa('git', ['commit', '-m', 'Remote content edit'], { cwd: fixture.courseDevDir });
    await execa('git', ['push'], { cwd: fixture.courseDevDir });
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const upload = vi.spyOn(chunks, 'prepareQuestionContentChunks');
    const operation = await save();
    await operation.run();
    expect(load).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0][0].qids).toEqual(expect.arrayContaining([qid, util.QUESTION_ID]));
    assert.lengthOf(await chunks.selectChunksForCourse(courseId), beforeChunks.length);
  });

  async function prepareSharedAssessment({ available = true, splitPoints = false } = {}) {
    await features.enable('question-sharing');
    const sourceData = util.getCourseData();
    sourceData.courseInstances = {};
    sourceData.questions = {
      shared: {
        ...sourceData.questions[util.QUESTION_ID],
        uuid: randomUUID(),
        sharePublicly: available,
        preferences: { mode: { type: 'string', enum: ['a', 'b'], default: 'a' } },
      },
    };
    const sourceDir = path.join(fixture.baseDir, 'source');
    await util.writeCourseToDirectory(sourceData, sourceDir);
    const { courseId: sourceId } = await util.syncCourseData(sourceDir);
    await courseModel.updateCourseSharingName({ course_id: sourceId, sharing_name: 'source' });
    const assessmentPath = path.join(
      fixture.courseOriginDir,
      'courseInstances',
      util.COURSE_INSTANCE_ID,
      'assessments',
      util.ASSESSMENT_ID,
      'infoAssessment.json',
    );
    const assessment = await fs.readJson(assessmentPath);
    await fs.writeJson(assessmentPath, {
      ...assessment,
      zones: [
        {
          questions: [
            {
              ...(splitPoints ? { autoPoints: 7, manualPoints: 3 } : { points: 10 }),
              alternatives: [
                { id: util.QUESTION_ID },
                { id: '@source/shared', preferences: { mode: 'a' } },
              ],
            },
          ],
        },
      ],
    });
    await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
    await execa('git', ['commit', '-m', 'Import shared question'], {
      cwd: fixture.courseOriginDir,
    });
    await sync();
    return { sourceData, sourceDir, sourceId };
  }

  it('revalidates incompatible shared preferences without a consumer Git change and keeps the preflight read-only', async () => {
    await withConfig({ checkSharingOnSync: true }, async () => {
      const { sourceData, sourceDir } = await prepareSharedAssessment();
      const beforeCourse = await selectCourseById(courseId);
      const beforeAssessments = await util.dumpTableWithSchema('assessments', AssessmentSchema);
      sourceData.questions.shared.preferences = {
        mode: { type: 'string', enum: ['b'], default: 'b' },
      };
      await util.overwriteAndSyncCourseData(sourceData, sourceDir);
      assert.isTrue(await assessmentDependenciesRequireFullSync(beforeCourse));
      assert.deepEqual(
        await util.dumpTableWithSchema('assessments', AssessmentSchema),
        beforeAssessments,
      );
      assert.deepEqual(await selectCourseById(courseId), beforeCourse);
      const load = vi.spyOn(courseDB, 'loadFullCourse');
      await sync();
      expect(load).toHaveBeenCalledOnce();
      const errored = await util.dumpTableWithSchema('assessments', AssessmentSchema);
      assert.include(errored[0].sync_errors!, 'mode');
      assert.equal(await getCourseCommitHash(courseDir), beforeCourse.commit_hash);
    });
  });

  it.each([true, false])(
    'reconciles an unavailable import with sharing validation enabled=%s',
    async (checkSharingOnSync) => {
      await withConfig({ checkSharingOnSync }, async () => {
        const { sourceId } = await prepareSharedAssessment({ available: false });
        const previousError = (await util.dumpTableWithSchema('assessments', AssessmentSchema))[0]
          .sync_errors;
        if (checkSharingOnSync) assert.isNotNull(previousError);
        else assert.isNull(previousError);
        const source = await selectQuestionByQid({ course_id: sourceId, qid: 'shared' });
        assert.isFalse(
          (await util.dumpTableWithSchema('assessment_questions', AssessmentQuestionSchema)).some(
            (aq) => aq.question_id === source.id && aq.deleted_at === null,
          ),
        );
        await updateQuestion({ question_id: source.id, patch: { share_publicly: true } });
        const load = vi.spyOn(courseDB, 'loadFullCourse');
        await sync();
        expect(load).toHaveBeenCalledOnce();
        assert.isNull(
          (await util.dumpTableWithSchema('assessments', AssessmentSchema))[0].sync_errors,
        );
        assert.isTrue(
          (await util.dumpTableWithSchema('assessment_questions', AssessmentQuestionSchema)).some(
            (aq) => aq.question_id === source.id && aq.deleted_at === null,
          ),
        );
      });
    },
  );

  it('keeps partial sync when imported preferences stay compatible after their default changes', async () => {
    await withConfig({ checkSharingOnSync: true }, async () => {
      const { sourceData, sourceDir } = await prepareSharedAssessment();
      sourceData.questions.shared.preferences = {
        mode: { type: 'string', enum: ['a', 'b'], default: 'b' },
      };
      await util.overwriteAndSyncCourseData(sourceData, sourceDir);
      const before = await util.dumpTableWithSchema('assessments', AssessmentSchema);
      const load = vi.spyOn(courseDB, 'loadFullCourse');
      await sync();
      expect(load).not.toHaveBeenCalled();
      assert.deepEqual(await util.dumpTableWithSchema('assessments', AssessmentSchema), before);
    });
  });

  it('relinks the assessment when the shared reference resolves to a new question ID', async () => {
    await withConfig({ checkSharingOnSync: true }, async () => {
      const { sourceData, sourceDir, sourceId } = await prepareSharedAssessment();
      const [{ id: assessmentId }] = await util.dumpTableWithSchema(
        'assessments',
        AssessmentSchema,
      );
      const original = await selectQuestionByQid({ course_id: sourceId, qid: 'shared' });
      const selectLink = (question_id: string) =>
        selectAssessmentQuestionByQuestionId({ assessment_id: assessmentId, question_id });
      assert.isNull((await selectLink(original.id)).deleted_at);

      sourceData.questions.shared.uuid = randomUUID();
      await util.overwriteAndSyncCourseData(sourceData, sourceDir);
      const replacement = await selectQuestionByQid({ course_id: sourceId, qid: 'shared' });
      assert.notEqual(replacement.id, original.id);

      const load = vi.spyOn(courseDB, 'loadFullCourse');
      await sync();
      expect(load).toHaveBeenCalledOnce();
      assert.isNotNull((await selectLink(original.id)).deleted_at);
      assert.isNull((await selectLink(replacement.id)).deleted_at);
    });
  });

  it.each([false, true])(
    'reconciles a shared grading-method change according to the explicit point split (%s)',
    async (splitPoints) => {
      await withConfig({ checkSharingOnSync: true }, async () => {
        const { sourceData, sourceDir, sourceId } = await prepareSharedAssessment({ splitPoints });
        const [{ id: assessment_id }] = await util.dumpTableWithSchema(
          'assessments',
          AssessmentSchema,
        );
        const source = await selectQuestionByQid({ course_id: sourceId, qid: 'shared' });
        const linkedQuestion = { assessment_id, question_id: source.id };
        expect(await selectAssessmentQuestionByQuestionId(linkedQuestion)).toMatchObject({
          max_auto_points: splitPoints ? 7 : 10,
          max_manual_points: splitPoints ? 3 : 0,
        });

        sourceData.questions.shared.gradingMethod = 'Manual';
        await util.overwriteAndSyncCourseData(sourceData, sourceDir);
        const load = vi.spyOn(courseDB, 'loadFullCourse');
        await sync();
        expect(load).toHaveBeenCalledTimes(splitPoints ? 0 : 1);
        expect(await selectAssessmentQuestionByQuestionId(linkedQuestion)).toMatchObject({
          max_auto_points: splitPoints ? 7 : 0,
          max_manual_points: splitPoints ? 3 : 10,
        });
      });
    },
  );

  it.each(['access', 'deletion', 'rename'] as const)(
    'uses full sync when an imported reference becomes unavailable through %s',
    async (reason) => {
      await withConfig({ checkSharingOnSync: true }, async () => {
        const { sourceData, sourceDir, sourceId } = await prepareSharedAssessment();
        const source = await selectQuestionByQid({ course_id: sourceId, qid: 'shared' });
        if (reason === 'rename') {
          sourceData.questions.renamed = sourceData.questions.shared;
          delete sourceData.questions.shared;
          // Exercise a stale consumer reference even if producer-side checks normally reject it.
          await withConfig({ checkSharingOnSync: false }, () =>
            util.overwriteAndSyncCourseData(sourceData, sourceDir),
          );
          assert.equal(
            (await selectQuestionByQid({ course_id: sourceId, qid: 'renamed' })).id,
            source.id,
          );
        } else {
          await updateQuestion({
            question_id: source.id,
            patch: reason === 'access' ? { share_publicly: false } : { deleted_at: new Date() },
          });
        }
        const load = vi.spyOn(courseDB, 'loadFullCourse');
        await sync();
        expect(load).toHaveBeenCalledOnce();
        assert.include(
          (await util.dumpTableWithSchema('assessments', AssessmentSchema))[0].sync_errors!,
          '@source/shared',
        );
      });
    },
  );

  it('uses partial processing for sync-only remote content changes', async () => {
    const beforeChunks = await chunks.selectChunksForCourse(courseId);
    await fs.writeFile(
      path.join(fixture.courseOriginDir, 'questions', qid, 'question.html'),
      '<p>Remote only</p>',
    );
    await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
    await execa('git', ['commit', '-m', 'Remote edit'], { cwd: fixture.courseOriginDir });
    assert.equal(await fs.readFile(filePath, 'utf8'), originContents);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const readInfo = vi.spyOn(courseDB, 'loadInfoFile');
    const { jobPromise } = await pullAndUpdateCourse({
      course: await selectCourseById(courseId),
      userId: user.id,
      authnUserId: user.id,
    });
    await jobPromise;
    expect(load).not.toHaveBeenCalled();
    assert.isFalse(
      readInfo.mock.calls.some(([{ filePath }]) => filePath.endsWith('infoAssessment.json')),
    );
    assert.equal(
      (await selectCourseById(courseId)).commit_hash,
      await getCourseCommitHash(courseDir),
    );
    assert.lengthOf(await chunks.selectChunksForCourse(courseId), beforeChunks.length);
    const question = await selectQuestionByQid({ course_id: courseId, qid });
    config.chunksConsumer = true;
    config.chunksConsumerDirectory = path.join(fixture.baseDir, 'runtime');
    await chunks.ensureChunksForCourseAsync(courseId, {
      type: 'question',
      questionId: question.id,
    });
    const runtime = chunks.getRuntimeDirectoryForCourse({ id: courseId, path: courseDir });
    assert.equal(
      await fs.readFile(path.join(runtime, 'questions', qid, 'question.html'), 'utf8'),
      '<p>Remote only</p>',
    );
  });

  it.each(['upload', 'database'])(
    'rolls back metadata, chunks, commit, and configuration on %s failure and recovers a reverted edit',
    async (failure) => {
      const beforeQuestion = await selectQuestionByQid({ course_id: courseId, qid });
      const beforeCourse = await selectCourseById(courseId);
      const beforeChunks = await util.dumpTableWithSchema('chunks', ChunkSchema);
      const infoPath = path.join(path.dirname(filePath), 'info.json');
      const original = await fs.readFile(infoPath, 'utf8');
      const changed = JSON.stringify({ ...JSON.parse(original), title: 'Changed title' });
      await withConfig(
        { externalGradingMaximumTimeout: config.externalGradingMaximumTimeout + 1 },
        async () => {
          const upload = vi.spyOn(chunks, 'prepareChunksForCourse');
          const publishConfiguration = courseModel.updateCourseSyncConfiguration;
          const publish = vi.spyOn(courseModel, 'updateCourseSyncConfiguration');
          if (failure === 'upload') upload.mockRejectedValueOnce(new Error('Upload failed'));
          if (failure === 'database') {
            publish.mockImplementation(async (id, configuration) => {
              await publishConfiguration(id, configuration);
              if (configuration !== null) throw new Error('Database failed');
            });
          }
          const operation = await save(infoPath, changed);
          await expect(operation.run()).rejects.toThrow(
            failure === 'upload' ? 'Upload failed' : 'Database failed',
          );
          assert.deepEqual(await selectQuestionByQid({ course_id: courseId, qid }), beforeQuestion);
          assert.deepEqual(await util.dumpTableWithSchema('chunks', ChunkSchema), beforeChunks);
          const afterCourse = await selectCourseById(courseId);
          assert.equal(afterCourse.commit_hash, beforeCourse.commit_hash);
          assert.deepEqual(afterCourse.sync_configuration, beforeCourse.sync_configuration);
          assert.notEqual(await getCourseCommitHash(courseDir), beforeCourse.commit_hash);
          if (failure === 'database') {
            const prepared = await upload.mock.results[0].value;
            assert.isAbove(prepared.generatedChunks.length, 0);
          }
          publish.mockRestore();
        },
      );
      // Original settings prevent configuration invalidation from masking an empty-diff bug.
      const retry = await save(infoPath, original);
      await retry.run();
      const currentHash = await getCourseCommitHash(courseDir);
      const { stdout: diff } = await execa(
        'git',
        ['diff', '--name-only', beforeCourse.commit_hash!, currentHash],
        { cwd: courseDir },
      );
      assert.equal(diff, '');
      assert.deepEqual(await selectQuestionByQid({ course_id: courseId, qid }), beforeQuestion);
      const afterCourse = await selectCourseById(courseId);
      assert.equal(afterCourse.commit_hash, currentHash);
      assert.deepEqual(afterCourse.sync_configuration, beforeCourse.sync_configuration);
    },
  );
});
