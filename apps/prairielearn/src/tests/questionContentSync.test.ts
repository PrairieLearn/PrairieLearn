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

import { b64EncodeUnicode } from '../lib/base64-util.js';
import * as chunks from '../lib/chunks.js';
import { config } from '../lib/config.js';
import { ChunkSchema, QuestionSchema, type User } from '../lib/db-types.js';
import { computeEncodedFileContentHash } from '../lib/editorUtil.js';
import { FileModifyEditor, classifyEditOutcome } from '../lib/editors.js';
import { selectJobsByJobSequenceId } from '../lib/server-jobs.js';
import {
  getCourseCommitHash,
  invalidateCourseSync,
  recordSuccessfulCourseSync,
  selectCourseById,
  updateCourseColumn,
  updateCourseCommitHash,
} from '../models/course.js';
import { selectQuestionByQid } from '../models/question.js';
import { selectOrInsertUserByUid } from '../models/user.js';
import * as courseDB from '../sync/course-db.js';
import { CURRENT_SYNC_VERSION } from '../sync/version.js';

import {
  type CourseRepoFixture,
  commitOriginAndSync,
  createCourseRepoFixture,
} from './helperCourse.js';
import * as helperDb from './helperDb.js';
import * as util from './sync/util.js';

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
      },
    });
    courseDir = fixture.courseLiveDir;
    const result = await util.syncCourseData(courseDir);
    courseId = result.courseId;
    filePath = path.join(courseDir, 'questions', qid, 'question.html');
    user = await selectOrInsertUserByUid('editor@example.com');
    await updateCourseCommitHash({ id: courseId, path: courseDir });
    await establishBaseline();
  });

  async function establishBaseline(version = CURRENT_SYNC_VERSION) {
    await recordSuccessfulCourseSync(courseId, {
      commitHash: await getCourseCommitHash(courseDir),
      version,
      chunksGenerated: config.chunksGenerator,
    });
  }

  async function save(targetPath = filePath, content = '<p>Updated</p>') {
    const course = await selectCourseById(courseId);
    const previous = await fs.readFile(targetPath, 'utf8');
    const editor = new FileModifyEditor({
      locals: { course, user, authz_data: { has_course_permission_edit: true, authn_user: user } },
      container: { rootPath: courseDir, invalidRootPaths: [] },
      filePath: targetPath,
      editContents: b64EncodeUnicode(content),
      origHash: computeEncodedFileContentHash(b64EncodeUnicode(previous)),
    });
    const job = await editor.prepareServerJob();
    return {
      editor,
      run: () => editor.executeWithServerJob(job),
      result: async () => (await selectJobsByJobSequenceId(job.jobSequenceId))[0],
    };
  }

  it('saves nested-question content and publishes only its chunk without loading course metadata', async () => {
    config.chunksGenerator = true;
    config.chunksConsumer = true;
    config.chunksConsumerDirectory = path.join(fixture.baseDir, 'runtime');
    await establishBaseline();
    await chunks.updateQuestionContentChunk({ coursePath: courseDir, courseId, qid });
    await chunks.updateQuestionContentChunk({
      coursePath: courseDir,
      courseId,
      qid: util.QUESTION_ID,
    });
    const before = await util.dumpTableWithSchema('chunks', ChunkSchema);
    const question = await selectQuestionByQid({ course_id: courseId, qid });
    const targeted = vi.spyOn(chunks, 'updateQuestionContentChunk');
    const full = vi.spyOn(chunks, 'updateChunksForCourse');
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const metadataBefore = await util.dumpTableWithSchema('questions', QuestionSchema);
    const operation = await save();
    await operation.run();
    assert.equal(await fs.readFile(filePath, 'utf8'), '<p>Updated</p>');
    expect(load).not.toHaveBeenCalled();
    expect(targeted).toHaveBeenCalledExactlyOnceWith({ coursePath: courseDir, courseId, qid });
    expect(await targeted.mock.results[0].value).toEqual({
      updatedChunks: [{ type: 'question', questionName: qid }],
      deletedChunks: [],
      replacedChunkIds: [before.find((chunk) => chunk.question_id === question.id)!.id],
    });
    expect(full).not.toHaveBeenCalled();
    assert.deepEqual(await util.dumpTableWithSchema('questions', QuestionSchema), metadataBefore);
    assert.equal(classifyEditOutcome((await operation.result()).data), 'success');
    assert.equal(
      (await selectCourseById(courseId)).last_successful_sync?.commitHash,
      await getCourseCommitHash(courseDir),
    );

    const after = await util.dumpTableWithSchema('chunks', ChunkSchema);
    assert.lengthOf(after, 2);
    const updated = after.find((chunk) => chunk.question_id === question.id)!;
    assert.equal(updated.commit_hash, await getCourseCommitHash(courseDir));
    assert.isAbove(updated.size_compressed!, 0);
    assert.isAbove(updated.size_uncompressed!, 0);
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

  it.each(['old version', 'unexpected change', 'symlink', 'chunk mode changed'])(
    'uses full sync for %s',
    async (reason) => {
      if (reason === 'old version') await establishBaseline(CURRENT_SYNC_VERSION - 1);
      if (reason === 'symlink') {
        await fs.symlink(
          'infoCourse.json',
          path.join(fixture.courseOriginDir, 'metadata-alias.json'),
        );
        await commitOriginAndSync(fixture, 'Add metadata symlink');
        await updateCourseCommitHash({ id: courseId, path: courseDir });
        await establishBaseline();
      }
      if (reason === 'chunk mode changed') {
        await recordSuccessfulCourseSync(courseId, {
          commitHash: await getCourseCommitHash(courseDir),
          version: CURRENT_SYNC_VERSION,
          chunksGenerated: true,
        });
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

  it('fully syncs restored question metadata and does not establish a baseline on JSON errors', async () => {
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
    assert.isNull((await selectCourseById(courseId)).last_successful_sync);
    assert.equal(classifyEditOutcome((await invalid.result()).data), 'sync_json_errors');
  });

  it('refreshes eligibility after acquiring the lock instead of trusting the request snapshot', async () => {
    const operation = await save();
    await invalidateCourseSync(courseId);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    await operation.run();
    expect(load).toHaveBeenCalled();
  });

  it('rejects a changed course directory before mutation', async () => {
    const operation = await save();
    const baseline = (await selectCourseById(courseId)).last_successful_sync;
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
    assert.deepEqual((await selectCourseById(courseId)).last_successful_sync, baseline);
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

  it('invalidates the baseline without advancing the commit on publication failure and fully syncs the next save', async () => {
    config.chunksGenerator = true;
    await establishBaseline();
    const previousCommit = (await selectCourseById(courseId)).commit_hash;
    vi.spyOn(chunks, 'updateQuestionContentChunk').mockRejectedValue(new Error('Upload failed'));
    const operation = await save();
    await expect(operation.run()).rejects.toThrow('Upload failed');
    assert.equal(classifyEditOutcome((await operation.result()).data), 'sync_failed');
    const failed = await selectCourseById(courseId);
    assert.isNull(failed.last_successful_sync);
    assert.equal(failed.commit_hash, previousCommit);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const next = await save(filePath, '<p>Another update</p>');
    await next.run();
    expect(load).toHaveBeenCalled();
    assert.equal(
      (await selectCourseById(courseId)).last_successful_sync?.commitHash,
      await getCourseCommitHash(courseDir),
    );
  });
});
