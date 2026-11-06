import { randomUUID } from 'node:crypto';
import path from 'node:path';

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
import { QuestionSchema, type User } from '../lib/db-types.js';
import { computeEncodedFileContentHash } from '../lib/editorUtil.js';
import {
  FileModifyEditor,
  MultiEditor,
  QuestionRenameEditor,
  classifyEditOutcome,
} from '../lib/editors.js';
import type { ServerJob, ServerJobExecutor } from '../lib/server-jobs.js';
import {
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

import * as helperDb from './helperDb.js';
import * as util from './sync/util.js';

// Other suites share this worker's module cache and may have loaded the real Git client.
const git = vi.hoisted(() => {
  vi.resetModules();
  return vi.fn();
});
vi.mock('execa', () => ({ execa: git }));

const user: User = {
  id: '1',
  uid: 'editor@example.com',
  name: 'Editor',
  email: null,
  institution_id: '1',
  lti_context_id: null,
  lti_course_instance_id: null,
  lti_user_id: null,
  stripe_customer_id: null,
  terms_accepted_at: null,
  uin: null,
};

// Git transport is simulated; file writes, metadata sync, and eligibility state use real storage.
describe('content-only question save', () => {
  let courseId: string;
  let courseDir: string;
  let filePath: string;
  let currentHash: string;
  let changedPaths: string;
  let trackedFiles: string;
  let originContents: string;
  let originInfo: string;
  let originHash: string;
  let pushFailures: number;
  let commitCounter: number;

  beforeAll(helperDb.before);
  afterAll(async () => {
    try {
      await helperDb.after();
    } finally {
      vi.doUnmock('execa');
      vi.resetModules();
    }
  });
  afterEach(() => vi.restoreAllMocks());
  beforeEach(async () => {
    await helperDb.resetDatabase();
    config.fileEditorUseGit = true;
    config.chunksGenerator = false;
    currentHash = 'a'.repeat(40);
    originHash = currentHash;
    changedPaths = 'M\0questions/nested/question/question.html\0';
    trackedFiles = '';
    pushFailures = 0;
    commitCounter = 0;
    git.mockImplementation(async (_file, args: string[]) => ({
      stdout:
        args[0] === 'show'
          ? originInfo
          : args[0] === 'diff'
            ? changedPaths
            : args[0] === 'ls-files'
              ? trackedFiles
              : args[0] === 'remote'
                ? '/temporary/origin'
                : args[0] === 'symbolic-ref'
                  ? 'origin/master'
                  : currentHash,
    }));
    const data = util.getCourseData();
    data.questions['nested/question'] = { ...data.questions[util.QUESTION_ID], uuid: randomUUID() };
    const fixture = await util.writeAndSyncCourseData(data);
    courseDir = fixture.courseDir;
    courseId = fixture.syncResults.courseId;
    filePath = path.join(courseDir, 'questions/nested/question/question.html');
    originInfo = await fs.readFile(path.join(path.dirname(filePath), 'info.json'), 'utf8');
    originContents = '<p>Original</p>';
    await fs.writeFile(filePath, originContents);
    await updateCourseCommitHash({ id: courseId, path: courseDir });
    await establishBaseline();
  });

  async function establishBaseline() {
    await recordSuccessfulCourseSync(courseId, {
      commitHash: currentHash,
      version: CURRENT_SYNC_VERSION,
      chunksGenerated: config.chunksGenerator,
    });
  }

  async function save(
    targetPath = filePath,
    content = '<p>Updated</p>',
    mode: 'file' | 'settings' | 'rename' = 'file',
  ) {
    const course = await selectCourseById(courseId);
    const previous = await fs.readFile(targetPath, 'utf8');
    const locals = {
      course,
      user,
      authz_data: { has_course_permission_edit: true, authn_user: user },
    };
    const fileEditor = new FileModifyEditor({
      locals,
      container: { rootPath: courseDir, invalidRootPaths: [] },
      filePath: targetPath,
      editContents: b64EncodeUnicode(content),
      origHash: computeEncodedFileContentHash(b64EncodeUnicode(previous)),
    });
    const question = await selectQuestionByQid({ course_id: courseId, qid: 'nested/question' });
    const renameEditor = new QuestionRenameEditor({
      locals: { ...locals, question },
      qid_new: question.qid!,
      title_new: mode === 'rename' ? (JSON.parse(content) as { title: string }).title : undefined,
    });
    const editor =
      mode === 'settings'
        ? new MultiEditor({ locals, description: 'Update question settings' }, [
            fileEditor,
            renameEditor,
          ])
        : mode === 'rename'
          ? renameEditor
          : fileEditor;
    const info = vi.fn<ServerJob['info']>();
    const job: ServerJob = {
      data: {},
      info,
      verbose: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      fail: (message) => {
        throw new Error(message);
      },
      stop: (message) => {
        throw new Error(message);
      },
      exec: vi.fn(async (_file, args) => {
        if (args[0] === 'reset' && args[2]?.startsWith('origin/')) {
          currentHash = originHash;
          await fs.writeFile(filePath, originContents);
        }
        if (args.includes('commit')) currentHash = (++commitCounter).toString(16).padStart(40, '0');
        if (args[0] === 'push') {
          if (pushFailures-- > 0) throw new Error('Remote changed');
          originHash = currentHash;
          originContents = await fs.readFile(filePath, 'utf8');
        }
        return { data: {} };
      }),
    };
    const execute: ServerJobExecutor['executeUnsafe'] = async (fn) => {
      await fn(job);
      return { data: job.data };
    };
    const executor: ServerJobExecutor = {
      jobSequenceId: '1',
      execute,
      executeUnsafe: execute,
      executeInBackground: () => {
        throw new Error('Unexpected background job');
      },
    };
    return { job, info, run: () => editor.executeWithServerJob(executor) };
  }

  it('saves nested-question content without loading course metadata and advances the baseline', async () => {
    config.chunksGenerator = true;
    await establishBaseline();
    const targeted = vi
      .spyOn(chunks, 'updateQuestionContentChunk')
      .mockResolvedValue({ updatedChunks: [], deletedChunks: [] });
    const full = vi.spyOn(chunks, 'updateChunksForCourse');
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const metadataBefore = await util.dumpTableWithSchema('questions', QuestionSchema);
    const operation = await save();
    await operation.run();
    assert.equal(await fs.readFile(filePath, 'utf8'), '<p>Updated</p>');
    assert.equal(load.mock.calls.length, 0);
    assert.equal(targeted.mock.calls.length, 1);
    assert.equal(full.mock.calls.length, 0);
    assert.deepEqual(await util.dumpTableWithSchema('questions', QuestionSchema), metadataBefore);
    assert.equal(classifyEditOutcome(operation.job.data), 'success');
    assert.equal((await selectCourseById(courseId)).last_successful_sync?.commitHash, currentHash);
  });

  it.each(['unexpected change', 'symlink'])('uses full sync for %s', async (reason) => {
    if (reason === 'unexpected change') changedPaths += 'M\0infoCourse.json\0';
    if (reason === 'symlink') trackedFiles = '120000 abc 0\tquestions/link\0';
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const operation = await save();
    await operation.run();
    assert.isAbove(load.mock.calls.length, 0);
    assert.equal(classifyEditOutcome(operation.job.data), 'success');
  });

  it.each(['settings', 'rename'] as const)(
    'syncs a title-only %s edit without loading the course',
    async (mode) => {
      config.chunksGenerator = true;
      await establishBaseline();
      changedPaths = 'M\0questions/nested/question/info.json\0';
      const load = vi.spyOn(courseDB, 'loadFullCourse');
      const targeted = vi
        .spyOn(chunks, 'updateQuestionContentChunk')
        .mockResolvedValue({ updatedChunks: [], deletedChunks: [] });
      const before = await util.dumpTableWithSchema('questions', QuestionSchema);
      const infoPath = path.join(path.dirname(filePath), 'info.json');
      const operation = await save(
        infoPath,
        JSON.stringify({ ...JSON.parse(originInfo), title: 'New title' }),
        mode,
      );
      await operation.run();
      assert.equal(load.mock.calls.length, 0);
      assert.equal(targeted.mock.calls.length, 1);
      assert.sameDeepMembers(
        await util.dumpTableWithSchema('questions', QuestionSchema),
        before.map((question) =>
          question.qid === 'nested/question' ? { ...question, title: 'New title' } : question,
        ),
      );
      assert.equal(
        (await selectCourseById(courseId)).last_successful_sync?.commitHash,
        currentHash,
      );
      assert.equal(classifyEditOutcome(operation.job.data), 'success');
    },
  );

  it('uses full sync when question metadata beyond the title changes', async () => {
    const jsonPath = path.join(path.dirname(filePath), 'info.json');
    const info = await fs.readJson(jsonPath);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const operation = await save(
      jsonPath,
      JSON.stringify({ ...info, title: 'Changed title', topic: 'Changed topic' }),
    );
    await operation.run();
    assert.isAbove(load.mock.calls.length, 0);
  });

  it('refreshes eligibility after acquiring the lock instead of trusting the request snapshot', async () => {
    const operation = await save();
    await invalidateCourseSync(courseId);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    await operation.run();
    assert.isAbove(load.mock.calls.length, 0);
  });

  it('rejects a changed course directory before mutation', async () => {
    const operation = await save();
    const baseline = (await selectCourseById(courseId)).last_successful_sync;
    const newCoursePath = path.join(courseDir, 'moved');
    const newFilePath = path.join(newCoursePath, 'questions/nested/question/question.html');
    await fs.outputFile(newFilePath, '<p>New directory content</p>');
    const actor = await selectOrInsertUserByUid('admin@example.com');
    await updateCourseColumn({
      courseId,
      columnName: 'path',
      value: newCoursePath,
      authnUserId: actor.id,
    });
    const load = vi.spyOn(courseDB, 'loadFullCourse');

    await expect(operation.run()).rejects.toThrow(
      'The course directory changed. Reload the page before saving.',
    );

    assert.equal(await fs.readFile(filePath, 'utf8'), originContents);
    assert.equal(await fs.readFile(newFilePath, 'utf8'), '<p>New directory content</p>');
    assert.deepEqual((await selectCourseById(courseId)).last_successful_sync, baseline);
    assert.equal(vi.mocked(operation.job).exec.mock.calls.length, 0);
    assert.equal(load.mock.calls.length, 0);
    assert.equal(classifyEditOutcome(operation.job.data), 'save_failed');
  });

  it('uses full sync after push recovery', async () => {
    pushFailures = 1;
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const operation = await save();
    await operation.run();
    assert.isAbove(load.mock.calls.length, 0);
    assert.equal(classifyEditOutcome(operation.job.data), 'success');
  });

  it('leaves the baseline invalid when chunk publication fails and fully syncs the next save', async () => {
    config.chunksGenerator = true;
    await establishBaseline();
    vi.spyOn(chunks, 'updateQuestionContentChunk').mockRejectedValue(new Error('Upload failed'));
    changedPaths = 'M\0questions/nested/question/info.json\0';
    const infoPath = path.join(path.dirname(filePath), 'info.json');
    const operation = await save(
      infoPath,
      JSON.stringify({ ...JSON.parse(originInfo), title: 'New title' }),
      'settings',
    );
    await expect(operation.run()).rejects.toThrow('Upload failed');
    assert.equal(classifyEditOutcome(operation.job.data), 'sync_failed');
    assert.isNull((await selectCourseById(courseId)).last_successful_sync);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    vi.spyOn(chunks, 'updateChunksForCourse').mockResolvedValue({
      updatedChunks: [],
      deletedChunks: [],
    });
    const next = await save(filePath, '<p>Another update</p>');
    await next.run();
    assert.isAbove(load.mock.calls.length, 0);
  });

  it('does not establish a baseline when full sync completes with JSON errors', async () => {
    const operation = await save(path.join(path.dirname(filePath), 'info.json'), 'invalid JSON');
    await expect(operation.run()).rejects.toThrow('One or more JSON files contained errors');
    assert.isNull((await selectCourseById(courseId)).last_successful_sync);
    assert.equal(classifyEditOutcome(operation.job.data), 'sync_json_errors');
  });
});
