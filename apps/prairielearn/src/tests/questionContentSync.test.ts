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
import { ChunkSchema, QuestionSchema, type User } from '../lib/db-types.js';
import { getOriginalHash } from '../lib/editorUtil.js';
import { FileModifyEditor, classifyEditOutcome } from '../lib/editors.js';
import { selectJobsByJobSequenceId } from '../lib/server-jobs.js';
import * as courseModel from '../models/course.js';
import {
  getCourseCommitHash,
  selectCourseById,
  updateCourseColumn,
  updateCourseCommitHash,
} from '../models/course.js';
import { selectQuestionByQid } from '../models/question.js';
import { selectOrInsertUserByUid } from '../models/user.js';
import * as courseDB from '../sync/course-db.js';

import {
  type CourseRepoFixture,
  commitOriginAndSync,
  createCourseRepoFixture,
} from './helperCourse.js';
import * as helperDb from './helperDb.js';
import * as util from './sync/util.js';

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
    config.fileEditorUseGit = true;
    config.chunksGenerator = false;
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
    await updateCourseCommitHash({ id: courseId, path: courseDir });
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

  it('saves nested-question content and publishes only its chunk without loading course metadata', async () => {
    config.chunksGenerator = true;
    config.chunksConsumer = true;
    config.chunksConsumerDirectory = path.join(fixture.baseDir, 'runtime');
    await chunks.updateQuestionContentChunk({ coursePath: courseDir, courseId, qid });
    await chunks.updateQuestionContentChunk({
      coursePath: courseDir,
      courseId,
      qid: util.QUESTION_ID,
    });
    const before = await util.dumpTableWithSchema('chunks', ChunkSchema);
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

    const after = await util.dumpTableWithSchema('chunks', ChunkSchema);
    assert.lengthOf(after, 2);
    assert.notEqual(
      after.find((chunk) => chunk.question_id === question.id)!.uuid,
      before.find((chunk) => chunk.question_id === question.id)!.uuid,
    );
    assert.deepEqual(
      after.find((chunk) => chunk.question_id !== question.id),
      before.find((chunk) => chunk.question_id !== question.id),
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
        await updateCourseCommitHash({ id: courseId, path: courseDir });
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

  it('fully syncs restored question metadata and records JSON errors', async () => {
    const jsonPath = path.join(path.dirname(filePath), 'info.json');
    const info = await fs.readJson(jsonPath);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const operation = await save(jsonPath, JSON.stringify({ ...info, title: 'Changed title' }));
    await fs.remove(jsonPath);
    await operation.run();
    expect(load).toHaveBeenCalled();
    assert.equal((await selectQuestionByQid({ course_id: courseId, qid })).title, 'Changed title');

    load.mockClear();
    const invalid = await save(jsonPath, 'invalid JSON');
    await expect(invalid.run()).rejects.toThrow('One or more JSON files contained errors');
    expect(load).toHaveBeenCalled();
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
    config.chunksGenerator = true;
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
    assert.equal((await util.dumpTableWithSchema('chunks', ChunkSchema)).length, 2);
  });

  it('uses partial processing for sync-only remote content changes', async () => {
    config.chunksGenerator = true;
    await fs.writeFile(
      path.join(fixture.courseOriginDir, 'questions', qid, 'question.html'),
      '<p>Remote only</p>',
    );
    await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
    await execa('git', ['commit', '-m', 'Remote edit'], { cwd: fixture.courseOriginDir });
    assert.equal(await fs.readFile(filePath, 'utf8'), originContents);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const { jobPromise } = await pullAndUpdateCourse({
      course: await selectCourseById(courseId),
      userId: user.id,
      authnUserId: user.id,
    });
    await jobPromise;
    expect(load).not.toHaveBeenCalled();
    assert.equal(
      (await selectCourseById(courseId)).commit_hash,
      await getCourseCommitHash(courseDir),
    );
    assert.lengthOf(await util.dumpTableWithSchema('chunks', ChunkSchema), 1);
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
    'preserves metadata, references, and checkpoint on %s failure',
    async (failure) => {
      config.chunksGenerator = true;
      await chunks.updateQuestionContentChunk({ coursePath: courseDir, courseId, qid });
      const before = await selectQuestionByQid({ course_id: courseId, qid });
      const beforeChunks = await util.dumpTableWithSchema('chunks', ChunkSchema);
      const beforeCommit = (await selectCourseById(courseId)).commit_hash;
      const infoPath = path.join(path.dirname(filePath), 'info.json');
      const original = await fs.readFile(infoPath, 'utf8');
      const changed = JSON.stringify({ ...JSON.parse(original), title: 'Changed title' });
      const upload = vi.spyOn(chunks, 'prepareChunksForCourse');
      if (failure === 'upload') upload.mockRejectedValueOnce(new Error('Upload failed'));
      const checkpoint = vi.spyOn(courseModel, 'updateCourseCommitHash');
      if (failure === 'database') checkpoint.mockRejectedValueOnce(new Error('Database failed'));
      const operation = await save(infoPath, changed);
      await expect(operation.run()).rejects.toThrow(
        failure === 'upload' ? 'Upload failed' : 'Database failed',
      );
      assert.deepEqual(await selectQuestionByQid({ course_id: courseId, qid }), before);
      assert.deepEqual(await util.dumpTableWithSchema('chunks', ChunkSchema), beforeChunks);
      assert.equal((await selectCourseById(courseId)).commit_hash, beforeCommit);
      assert.notEqual(await getCourseCommitHash(courseDir), beforeCommit);
      if (failure === 'database') {
        const prepared = await upload.mock.results[0].value;
        assert.isAbove(prepared.generatedChunks.length, 0);
      }
      // Reverting B in C makes A..C empty; the UI path still requires reconciliation.
      const retry = await save(infoPath, original);
      await retry.run();
      assert.equal((await selectQuestionByQid({ course_id: courseId, qid })).title, before.title);
      assert.equal(
        (await selectCourseById(courseId)).commit_hash,
        await getCourseCommitHash(courseDir),
      );
    },
  );
});
