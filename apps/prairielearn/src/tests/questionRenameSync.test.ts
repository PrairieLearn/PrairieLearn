import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';
import { afterAll, afterEach, assert, beforeAll, describe, expect, it, vi } from 'vitest';

import { b64EncodeUnicode } from '../lib/base64-util.js';
import * as chunks from '../lib/chunks.js';
import { ensureChunksForCourseAsync, getRuntimeDirectoryForCourse } from '../lib/chunks.js';
import { config } from '../lib/config.js';
import { pullAndUpdateCourse } from '../lib/course.js';
import { ChunkSchema } from '../lib/db-types.js';
import { computeFileContentHash } from '../lib/editorUtil.js';
import { FileModifyEditor, MultiEditor, QuestionRenameEditor } from '../lib/editors.js';
import { features } from '../lib/features/index.js';
import * as courseModel from '../models/course.js';
import { getCourseCommitHash, selectCourseById } from '../models/course.js';
import { selectQuestionByQid } from '../models/question.js';
import { selectUserById } from '../models/user.js';
import * as courseDB from '../sync/course-db.js';
import { verifyQuestionRename } from '../sync/questionRenameSync.js';

import { type CourseRepoFixture, createCourseRepoFixture } from './helperCourse.js';
import * as helperServer from './helperServer.js';
import {
  assertSnapshotsMatch,
  captureDatabaseSnapshot,
  dumpTableWithSchema,
  syncCourseData,
} from './sync/util.js';
import { withConfig } from './utils/config.js';

describe('question QID sync with real Git and a course subdirectory', () => {
  let fixture: CourseRepoFixture;
  let qid = 'test/question';

  beforeAll(async () => {
    fixture = await createCourseRepoFixture({
      populateOrigin: async (repoDirectory) => {
        const directory = path.join(repoDirectory, 'course');
        await fs.copy(path.join(import.meta.dirname, 'testFileEditor/courseTemplate'), directory);
        const first = path.join(
          directory,
          'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
        );
        const assessment = await fs.readJson(first);
        await fs.outputJson(
          path.join(directory, 'courseInstances/Fa18/assessments/HW2/infoAssessment.json'),
          {
            ...assessment,
            uuid: randomUUID(),
            number: '2',
            zones: [{ questions: [{ alternatives: [{ id: qid, points: 10 }] }] }],
          },
        );
      },
    });
    fixture.courseLiveDir = path.join(fixture.courseLiveDir, 'course');
    fixture.courseOriginDir = path.join(fixture.courseOriginDir, 'course');
    config.fileEditorUseGit = true;
    config.chunksGenerator = true;
    await helperServer.before(fixture.courseLiveDir)();
    await features.enable('partial-course-sync');
    await sync();
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try {
      await helperServer.after();
    } finally {
      await fs.remove(fixture.baseDir);
    }
  });

  async function sync() {
    const course = await selectCourseById('1');
    const user = await selectUserById('1');
    const { jobPromise } = await pullAndUpdateCourse({
      course,
      userId: user.id,
      authnUserId: user.id,
    });
    await jobPromise;
  }

  async function prepareRename(edit: 'title' | 'gradingMethod' | 'content' | 'assessment') {
    const course = await selectCourseById('1');
    const user = await selectUserById('1');
    const question = await selectQuestionByQid({ course_id: course.id, qid });
    const locals = {
      course: await selectCourseById(course.id),
      user,
      authz_data: { has_course_permission_edit: true, authn_user: user },
      question,
    };
    const newQid = qid === 'test/question' ? 'renamed/nested/question' : 'test/question';
    const filePath =
      edit === 'assessment'
        ? path.join(course.path, 'courseInstances/Fa18/assessments/HW1/infoAssessment.json')
        : path.join(
            course.path,
            'questions',
            qid,
            edit === 'content' ? 'question.html' : 'info.json',
          );
    const previous = await fs.readFile(filePath, 'utf8');
    const content =
      edit === 'assessment'
        ? JSON.stringify({
            ...JSON.parse(previous),
            zones: [{ questions: [{ id: qid, points: 20 }] }],
          })
        : edit === 'content'
          ? `${previous}\n<p>Changed</p>`
          : JSON.stringify({
              ...JSON.parse(previous),
              ...(edit === 'title' ? { title: 'Renamed question' } : { gradingMethod: 'Manual' }),
            });
    const editor = new MultiEditor({ locals, description: 'Rename question' }, [
      new FileModifyEditor({
        locals,
        filePath,
        container: { rootPath: course.path, invalidRootPaths: [] },
        editContents: b64EncodeUnicode(content),
        origHash: computeFileContentHash(previous),
      }),
      new QuestionRenameEditor({ locals, qid_new: newQid }),
    ]);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const job = await editor.prepareServerJob();
    return { load, question, course, editor, job, newQid };
  }

  async function rename(edit: 'title' | 'gradingMethod' | 'content' | 'assessment') {
    const operation = await prepareRename(edit);
    await operation.editor.executeWithServerJob(operation.job);
    qid = operation.newQid;
    return operation;
  }

  it.each(['title', 'content'] as const)(
    'preserves identity, references, and chunks when renaming with a %s edit',
    async (edit) => {
      const before = await captureDatabaseSnapshot();
      const { load, question, course } = await rename(edit);
      assert.equal(load.mock.calls.length, 0);
      const renamed = await selectQuestionByQid({ course_id: course.id, qid });
      assert.equal(renamed.id, question.id);
      assert.equal(renamed.title, 'Renamed question');
      assert.equal(renamed.directory, qid);
      await withConfig(
        { chunksConsumer: true, chunksConsumerDirectory: path.join(fixture.baseDir, 'runtime') },
        async () => {
          await ensureChunksForCourseAsync(course.id, { type: 'question', questionId: renamed.id });
          const runtimeInfo = await fs.readJson(
            path.join(getRuntimeDirectoryForCourse(course), 'questions', qid, 'info.json'),
          );
          assert.equal(runtimeInfo.title, renamed.title);
          if (edit === 'content') {
            assert.include(
              await fs.readFile(
                path.join(getRuntimeDirectoryForCourse(course), 'questions', qid, 'question.html'),
                'utf8',
              ),
              '<p>Changed</p>',
            );
          }
        },
      );
      const targeted = await captureDatabaseSnapshot();
      assert.sameDeepMembers(targeted.assessmentQuestions, before.assessmentQuestions);
      for (const assessment of ['HW1', 'HW2']) {
        const info = await fs.readJson(
          path.join(
            course.path,
            'courseInstances/Fa18/assessments',
            assessment,
            'infoAssessment.json',
          ),
        );
        assert.include(JSON.stringify(info.zones), qid);
        assert.notInclude(JSON.stringify(info.zones), question.qid!);
      }
      assert.isFalse(await fs.pathExists(path.join(course.path, 'questions', question.qid!)));
      const result = await syncCourseData(course.path);
      await sync();
      assert.equal(result.status, 'complete');
      const full = await captureDatabaseSnapshot();
      assertSnapshotsMatch(targeted, full);
    },
  );

  it.each(['gradingMethod', 'assessment'] as const)(
    'uses full sync when a rename also changes %s',
    async (edit) => {
      const { load, question, course } = await rename(edit);
      expect(load).toHaveBeenCalled();
      const renamed = await selectQuestionByQid({ course_id: course.id, qid });
      assert.equal(renamed.id, question.id);
      if (edit === 'gradingMethod') {
        assert.equal(renamed.grading_method, 'Manual');
      } else {
        const snapshot = await captureDatabaseSnapshot();
        const assessment = snapshot.assessments.find((assessment) => assessment.tid === 'HW1')!;
        assert.equal(
          snapshot.assessmentQuestions.find(
            (aq) =>
              aq.assessment_id === assessment.id &&
              aq.question_id === renamed.id &&
              aq.deleted_at === null,
          )!.max_points,
          20,
        );
      }
    },
  );

  it.each(['upload', 'database'] as const)(
    'recovers a pushed rename and accumulated content after a %s failure without full sync',
    async (failure) => {
      const otherQid = `other-${failure}`;
      const otherPath = path.join(fixture.courseOriginDir, 'questions', otherQid);
      await fs.copy(path.join(fixture.courseOriginDir, 'questions', qid), otherPath);
      const info = await fs.readJson(path.join(otherPath, 'info.json'));
      await fs.writeJson(path.join(otherPath, 'info.json'), { ...info, uuid: randomUUID() });
      await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
      await execa('git', ['commit', '-m', 'Add unrelated question'], {
        cwd: fixture.courseOriginDir,
      });
      await execa('git', ['pull'], { cwd: fixture.courseLiveDir });
      await syncCourseData(fixture.courseLiveDir);
      await sync();
      const before = await captureDatabaseSnapshot();
      const beforeChunks = await dumpTableWithSchema('chunks', ChunkSchema);
      const operation = await prepareRename('title');
      const fail =
        failure === 'upload'
          ? vi
              .spyOn(chunks, 'prepareQuestionContentChunks')
              .mockRejectedValueOnce(new Error('Upload failed'))
          : vi
              .spyOn(courseModel, 'updateCourseCommitHash')
              .mockRejectedValueOnce(new Error('Checkpoint failed'));
      await expect(operation.editor.executeWithServerJob(operation.job)).rejects.toThrow(
        failure === 'upload' ? 'Upload failed' : 'Checkpoint failed',
      );
      fail.mockRestore();
      assert.deepEqual(await captureDatabaseSnapshot(), before);
      assert.deepEqual(await dumpTableWithSchema('chunks', ChunkSchema), beforeChunks);
      assert.equal((await selectCourseById('1')).commit_hash, operation.course.commit_hash);
      assert.notEqual(
        await getCourseCommitHash(fixture.courseLiveDir),
        operation.course.commit_hash,
      );
      await fs.writeFile(
        path.join(otherPath, 'question.html'),
        '<p>Accumulated remote content</p>',
      );
      await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
      await execa('git', ['commit', '-m', 'Remote content edit'], { cwd: fixture.courseOriginDir });
      const user = await selectUserById('1');
      const { jobPromise } = await pullAndUpdateCourse({
        course: await selectCourseById('1'),
        userId: user.id,
        authnUserId: user.id,
      });
      await jobPromise;
      qid = operation.newQid;
      expect(operation.load).not.toHaveBeenCalled();
      assert.equal((await selectQuestionByQid({ course_id: '1', qid })).id, operation.question.id);
      assert.equal(
        (await selectCourseById('1')).commit_hash,
        await getCourseCommitHash(fixture.courseLiveDir),
      );
      const after = await captureDatabaseSnapshot();
      assert.sameDeepMembers(after.assessmentQuestions, before.assessmentQuestions);
      const activeChunks = await chunks.selectChunksForCourse('1');
      assert.lengthOf(
        activeChunks,
        beforeChunks.filter((chunk) => chunk.superseded_at === null).length,
      );
      assert.notInclude(
        activeChunks.map((chunk) => chunk.question_id),
        null,
      );
      await withConfig(
        {
          chunksConsumer: true,
          chunksConsumerDirectory: path.join(fixture.baseDir, `runtime-${failure}`),
        },
        async () => {
          const other = await selectQuestionByQid({ course_id: '1', qid: otherQid });
          await ensureChunksForCourseAsync('1', { type: 'question', questionId: other.id });
          assert.equal(
            await fs.readFile(
              path.join(
                getRuntimeDirectoryForCourse(operation.course),
                'questions',
                otherQid,
                'question.html',
              ),
              'utf8',
            ),
            '<p>Accumulated remote content</p>',
          );
          await ensureChunksForCourseAsync('1', {
            type: 'question',
            questionId: operation.question.id,
          });
          assert.equal(
            (
              await fs.readJson(
                path.join(
                  getRuntimeDirectoryForCourse(operation.course),
                  'questions',
                  qid,
                  'info.json',
                ),
              )
            ).uuid,
            operation.question.uuid,
          );
        },
      );
    },
  );

  it('uses full sync to repair an assessment that only referenced the destination QID', async () => {
    const destination = qid === 'test/question' ? 'renamed/nested/question' : 'test/question';
    const original = await fs.readJson(
      path.join(
        fixture.courseOriginDir,
        'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
      ),
    );
    await fs.outputJson(
      path.join(
        fixture.courseOriginDir,
        'courseInstances/Fa18/assessments/HW3/infoAssessment.json',
      ),
      {
        ...original,
        uuid: randomUUID(),
        number: '3',
        zones: [{ questions: [{ id: destination, points: 10 }] }],
      },
    );
    await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
    await execa('git', ['commit', '-m', 'Missing destination fixture'], {
      cwd: fixture.courseOriginDir,
    });
    await execa('git', ['pull'], { cwd: fixture.courseLiveDir });
    await syncCourseData(fixture.courseLiveDir);
    await sync();
    const before = await captureDatabaseSnapshot();
    const missing = before.assessments.find((assessment) => assessment.tid === 'HW3')!;
    assert.include(missing.sync_errors!, destination);
    assert.isFalse(
      before.assessmentQuestions.some(
        (aq) => aq.assessment_id === missing.id && aq.deleted_at === null,
      ),
    );
    const { load, question, course } = await rename('title');
    expect(load).toHaveBeenCalled();
    assert.equal((await selectQuestionByQid({ course_id: course.id, qid })).id, question.id);
    const after = await captureDatabaseSnapshot();
    assert.isNull(
      after.assessments.find((assessment) => assessment.id === missing.id)!.sync_errors,
    );
    assert.isTrue(
      after.assessmentQuestions.some(
        (aq) =>
          aq.assessment_id === missing.id &&
          aq.question_id === question.id &&
          aq.deleted_at === null,
      ),
    );
    await syncCourseData(course.path);
    await sync();
    assertSnapshotsMatch(after, await captureDatabaseSnapshot());
  });

  it('rejects a copy that keeps the original question directory', async () => {
    const checkout = path.join(fixture.baseDir, 'copy-check');
    await execa('git', ['clone', path.dirname(fixture.courseLiveDir), checkout]);
    const directory = path.join(checkout, 'course');
    const { stdout: oldHash } = await execa('git', ['rev-parse', 'HEAD'], { cwd: directory });
    await fs.copy(path.join(directory, 'questions', qid), path.join(directory, 'questions/copied'));
    await execa('git', ['add', '.'], { cwd: directory });
    await execa(
      'git',
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        'commit',
        '-m',
        'Copy question',
      ],
      { cwd: directory },
    );
    const { stdout: newHash } = await execa('git', ['rev-parse', 'HEAD'], { cwd: directory });
    assert.isNull(
      await verifyQuestionRename({
        coursePath: directory,
        oldHash,
        newHash,
        scope: {
          kind: 'rename',
          qid,
          newQid: 'copied',
          uuid: (await selectQuestionByQid({ course_id: '1', qid })).uuid!,
          relativeFilePath: path.join('questions', qid, 'info.json'),
          assessmentPaths: [],
        },
      }),
    );
  });
  it('uses full sync to recover an assessment JSON repair accumulated before a rename', async () => {
    const assessmentPath = 'courseInstances/Fa18/assessments/HW1/infoAssessment.json';
    const originPath = path.join(fixture.courseOriginDir, assessmentPath);
    const valid = await fs.readFile(originPath, 'utf8');
    await fs.writeFile(originPath, '{ invalid JSON');
    await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
    await execa('git', ['commit', '-m', 'Invalid assessment fixture'], {
      cwd: fixture.courseOriginDir,
    });
    await execa('git', ['pull'], { cwd: fixture.courseLiveDir });
    await syncCourseData(fixture.courseLiveDir);
    await sync();
    const before = await captureDatabaseSnapshot();
    assert.isNotNull(
      before.assessments.find((assessment) => assessment.tid === 'HW1')!.sync_errors,
    );
    await fs.writeFile(originPath, valid);
    await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
    await execa('git', ['commit', '-m', 'Repair assessment fixture'], {
      cwd: fixture.courseOriginDir,
    });
    await execa('git', ['pull'], { cwd: fixture.courseLiveDir });
    const { load, question, course } = await rename('title');
    assert.isAbove(load.mock.calls.length, 0);
    assert.equal((await selectQuestionByQid({ course_id: course.id, qid })).id, question.id);
    const after = await captureDatabaseSnapshot();
    assert.isNull(after.assessments.find((assessment) => assessment.tid === 'HW1')!.sync_errors);
    assert.equal(
      (await selectCourseById(course.id)).commit_hash,
      await getCourseCommitHash(course.path),
    );
  });

  it('uses full sync to refresh duplicate UUID warnings when renaming', async () => {
    const course = await selectCourseById('1');
    const oldQid = qid;
    const duplicatePath = path.join(course.path, 'questions/duplicate-uuid');
    await fs.copy(path.join(course.path, 'questions', qid), duplicatePath);
    await execa('git', ['add', '.'], { cwd: course.path });
    await execa(
      'git',
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        'commit',
        '-m',
        'Duplicate UUID fixture',
      ],
      { cwd: course.path },
    );
    await execa('git', ['push'], { cwd: course.path });
    const baseline = await syncCourseData(course.path);
    await sync();
    assert.equal(baseline.status, 'complete');
    const original = await selectQuestionByQid({ course_id: course.id, qid });
    assert.isNull(original.uuid);
    const { load } = await rename('title');
    assert.isAbove(load.mock.calls.length, 0);
    const duplicate = await selectQuestionByQid({ course_id: course.id, qid: 'duplicate-uuid' });
    assert.include(duplicate.sync_warnings!, qid);
    assert.notInclude(duplicate.sync_warnings!, oldQid);
  });
  it('uses full sync for a remote rename below an existing question', async () => {
    const course = await selectCourseById('1');
    const sourceUuid = randomUUID();
    const original = await fs.readJson(
      path.join(fixture.courseOriginDir, 'questions', qid, 'info.json'),
    );
    await fs.outputJson(path.join(fixture.courseOriginDir, 'questions/nesting-source/info.json'), {
      ...original,
      uuid: sourceUuid,
      title: 'Nesting source',
    });
    await fs.outputJson(path.join(fixture.courseOriginDir, 'questions/nesting-parent/info.json'), {
      ...original,
      uuid: randomUUID(),
      title: 'Nesting parent',
    });
    await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
    await execa('git', ['commit', '-m', 'Nesting fixture'], { cwd: fixture.courseOriginDir });
    await execa('git', ['pull'], { cwd: fixture.courseLiveDir });
    await syncCourseData(course.path);
    await sync();
    const source = await selectQuestionByQid({ course_id: course.id, qid: 'nesting-source' });
    assert.equal(source.uuid, sourceUuid);
    assert.isNull(source.sync_errors);
    await fs.move(
      path.join(fixture.courseOriginDir, 'questions/nesting-source'),
      path.join(fixture.courseOriginDir, 'questions/nesting-parent/child'),
    );
    await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
    await execa('git', ['commit', '-m', 'Unsupported nested rename'], {
      cwd: fixture.courseOriginDir,
    });
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const user = await selectUserById('1');
    const { jobPromise } = await pullAndUpdateCourse({
      course: await selectCourseById(course.id),
      userId: user.id,
      authnUserId: user.id,
    });
    await jobPromise;
    expect(load).toHaveBeenCalled();
    const after = await captureDatabaseSnapshot();
    assert.isNotNull(after.questions.find((question) => question.id === source.id)!.deleted_at);
    await syncCourseData(course.path);
    await sync();
    assertSnapshotsMatch(after, await captureDatabaseSnapshot());
  });
});
