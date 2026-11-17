import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';
import { afterAll, afterEach, assert, beforeAll, expect, it, vi } from 'vitest';

import * as chunks from '../lib/chunks.js';
import { config } from '../lib/config.js';
import { pullAndUpdateCourse } from '../lib/course.js';
import { ChunkSchema } from '../lib/db-types.js';
import { QuestionAddEditor, QuestionCopyEditor } from '../lib/editors.js';
import * as courseModel from '../models/course.js';
import { getCourseCommitHash, selectCourseById } from '../models/course.js';
import { selectQuestionByQid, selectQuestionByUuid } from '../models/question.js';
import { selectUserById } from '../models/user.js';
import * as courseDB from '../sync/course-db.js';

import { type CourseRepoFixture, createCourseRepoFixture } from './helperCourse.js';
import * as helperServer from './helperServer.js';
import {
  assertSnapshotsMatch,
  captureDatabaseSnapshot,
  dumpTableWithSchema,
  syncCourseData,
} from './sync/util.js';

let fixture: CourseRepoFixture;

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

beforeAll(async () => {
  fixture = await createCourseRepoFixture(
    path.join(import.meta.dirname, 'testFileEditor/courseTemplate'),
  );
  config.fileEditorUseGit = true;
  config.chunksGenerator = true;
  await helperServer.before(fixture.courseLiveDir)();
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

it('uses full sync when creating a missing question repairs an assessment', async () => {
  const originPath = path.join(
    fixture.courseOriginDir,
    'courseInstances/Fa18/assessments/HW1/infoAssessment.json',
  );
  const assessment = await fs.readJson(originPath);
  await fs.writeJson(originPath, {
    ...assessment,
    zones: [{ questions: [{ id: 'recovered-question', points: 10 }] }],
  });
  await fs.outputJson(
    path.join(fixture.courseOriginDir, 'courseInstances/Fa18/assessments/HW2/infoAssessment.json'),
    {
      ...assessment,
      uuid: randomUUID(),
      number: '2',
      zones: [{ questions: [{ id: 'still-missing', points: 10 }] }],
    },
  );
  await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
  await execa('git', ['commit', '-m', 'Missing question references'], {
    cwd: fixture.courseOriginDir,
  });
  await execa('git', ['pull'], { cwd: fixture.courseLiveDir });
  await syncCourseData(fixture.courseLiveDir);
  await sync();
  const before = await captureDatabaseSnapshot();
  assert.include(
    before.assessments.find((assessment) => assessment.tid === 'HW1')!.sync_errors!,
    'recovered-question',
  );
  const user = await selectUserById('1');
  const course = await selectCourseById('1');
  const load = vi.spyOn(courseDB, 'loadFullCourse');
  const editor = new QuestionAddEditor({
    locals: { course, user, authz_data: { has_course_permission_edit: true, authn_user: user } },
    qid: 'recovered-question',
    title: 'Recovered question',
  });
  await expect(editor.executeWithServerJob(await editor.prepareServerJob())).rejects.toThrow(
    'One or more JSON files',
  );
  expect(load).toHaveBeenCalled();
  const question = await selectQuestionByUuid({ course_id: course.id, uuid: editor.uuid });
  const after = await captureDatabaseSnapshot();
  const repaired = after.assessments.find((assessment) => assessment.tid === 'HW1')!;
  assert.isNull(repaired.sync_errors);
  assert.isTrue(
    after.assessmentQuestions.some(
      (aq) =>
        aq.assessment_id === repaired.id &&
        aq.question_id === question.id &&
        aq.deleted_at === null,
    ),
  );
  assert.deepEqual(
    after.assessments.find((assessment) => assessment.tid === 'HW2'),
    before.assessments.find((assessment) => assessment.tid === 'HW2'),
  );
});

it('creates and copies questions without loading the course and matches full sync', async () => {
  const course = await selectCourseById('1');
  const user = await selectUserById('1');
  const locals = {
    course: await selectCourseById(course.id),
    user,
    authz_data: { has_course_permission_edit: true, authn_user: user },
  };
  const sourceQid = 'test/question';
  const editors = [
    new QuestionAddEditor({ locals, qid: 'new-question', title: 'New question' }),
    new QuestionCopyEditor({
      locals,
      from_course: course,
      from_qid: sourceQid,
      from_path: path.join(course.path, 'questions', sourceQid),
      is_transfer: false,
    }),
  ];
  const load = vi.spyOn(courseDB, 'loadFullCourse');
  try {
    for (const editor of editors) {
      await editor.executeWithServerJob(await editor.prepareServerJob());
      const question = await selectQuestionByUuid({ course_id: course.id, uuid: editor.uuid });
      assert.isNotNull(question.number);
      assert.isNotNull(question.topic_id);
      assert.equal(load.mock.calls.length, 0);
      const targeted = await captureDatabaseSnapshot();
      await syncCourseData(course.path);
      await sync();
      const full = await captureDatabaseSnapshot();
      assertSnapshotsMatch(targeted, full);
      load.mockClear();
    }
  } finally {
    load.mockRestore();
  }
});

it.each(['upload', 'database'] as const)(
  'recovers a pushed creation or copy and accumulated changes after a %s failure',
  async (failure) => {
    const course = await selectCourseById('1');
    const user = await selectUserById('1');
    const locals = {
      course,
      user,
      authz_data: { has_course_permission_edit: true, authn_user: user },
    };
    const editor =
      failure === 'upload'
        ? new QuestionAddEditor({ locals, qid: 'recovery-upload', title: 'Recovery upload' })
        : new QuestionCopyEditor({
            locals,
            from_course: course,
            from_qid: 'test/question',
            from_path: path.join(course.path, 'questions/test/question'),
            is_transfer: false,
          });
    const before = await captureDatabaseSnapshot();
    const beforeChunks = await dumpTableWithSchema('chunks', ChunkSchema);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const fault =
      failure === 'upload'
        ? vi
            .spyOn(chunks, 'prepareQuestionContentChunks')
            .mockRejectedValueOnce(new Error('Upload failed'))
        : vi
            .spyOn(courseModel, 'updateCourseCommitHash')
            .mockRejectedValueOnce(new Error('Checkpoint failed'));
    await expect(editor.executeWithServerJob(await editor.prepareServerJob())).rejects.toThrow(
      failure === 'upload' ? 'Upload failed' : 'Checkpoint failed',
    );
    fault.mockRestore();
    assert.deepEqual(await captureDatabaseSnapshot(), before);
    assert.deepEqual(await dumpTableWithSchema('chunks', ChunkSchema), beforeChunks);
    assert.equal((await selectCourseById(course.id)).commit_hash, course.commit_hash);
    assert.notEqual(await getCourseCommitHash(course.path), course.commit_hash);
    const remotePath = path.join(fixture.courseOriginDir, 'questions/test/question/question.html');
    await fs.writeFile(remotePath, `<p>Accumulated ${failure}</p>`);
    await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
    await execa('git', ['commit', '-m', 'Accumulated content'], { cwd: fixture.courseOriginDir });
    if (failure === 'upload') {
      const { jobPromise } = await pullAndUpdateCourse({
        course: await selectCourseById(course.id),
        userId: user.id,
        authnUserId: user.id,
      });
      await jobPromise;
    } else {
      const next = new QuestionAddEditor({
        locals: { ...locals, course: await selectCourseById(course.id) },
        qid: 'after-failed-copy',
        title: 'After failed copy',
      });
      await next.executeWithServerJob(await next.prepareServerJob());
      assert.isNotNull(
        (await selectQuestionByUuid({ course_id: course.id, uuid: next.uuid })).number,
      );
    }
    expect(load).not.toHaveBeenCalled();
    const created = await selectQuestionByUuid({ course_id: course.id, uuid: editor.uuid });
    assert.isNotNull(created.number);
    assert.isNotNull(created.topic_id);
    assert.equal(
      (await selectCourseById(course.id)).commit_hash,
      await getCourseCommitHash(course.path),
    );
    const activeChunks = await chunks.selectChunksForCourse(course.id);
    assert.lengthOf(
      activeChunks.filter((chunk) => chunk.question_id === created.id),
      1,
    );
    const source = await selectQuestionByQid({ course_id: course.id, qid: 'test/question' });
    assert.lengthOf(
      activeChunks.filter((chunk) => chunk.question_id === source.id),
      1,
    );
    const targeted = await captureDatabaseSnapshot();
    await syncCourseData(course.path);
    await sync();
    assertSnapshotsMatch(targeted, await captureDatabaseSnapshot());
  },
);

it('resolves copies of a new origin regardless of insertion order and matches full sync', async () => {
  const course = await selectCourseById('1');
  const originalPath = path.join(fixture.courseOriginDir, 'questions/test/question/info.json');
  const original = await fs.readJson(originalPath);
  const sourceUuid = randomUUID();
  const copyUuid = randomUUID();
  await fs.writeJson(originalPath, {
    ...original,
    copiedFrom: `${course.uuid.toUpperCase()}/${sourceUuid.toUpperCase()}/zz-source`,
  });
  await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
  await execa('git', ['commit', '-m', 'Existing copy with a pending origin'], {
    cwd: fixture.courseOriginDir,
  });
  await execa('git', ['pull'], { cwd: fixture.courseLiveDir });
  await syncCourseData(course.path);
  await sync();
  assert.isNull(
    (await selectQuestionByQid({ course_id: course.id, qid: 'test/question' }))
      .copied_from_question_id,
  );
  await fs.outputJson(path.join(fixture.courseOriginDir, 'questions/zz-source/info.json'), {
    ...original,
    uuid: sourceUuid,
    title: 'New origin',
  });
  await fs.outputJson(path.join(fixture.courseOriginDir, 'questions/aa-copy/info.json'), {
    ...original,
    uuid: copyUuid,
    title: 'New copy',
    copiedFrom: `${course.uuid}/${sourceUuid}`,
  });
  await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
  await execa('git', ['commit', '-m', 'New origin and dependent copy'], {
    cwd: fixture.courseOriginDir,
  });
  const user = await selectUserById('1');
  const load = vi.spyOn(courseDB, 'loadFullCourse');
  const { jobPromise } = await pullAndUpdateCourse({
    course: await selectCourseById(course.id),
    userId: user.id,
    authnUserId: user.id,
  });
  await jobPromise;
  expect(load).not.toHaveBeenCalled();
  const source = await selectQuestionByUuid({ course_id: course.id, uuid: sourceUuid });
  assert.equal(
    (await selectQuestionByUuid({ course_id: course.id, uuid: copyUuid })).copied_from_question_id,
    source.id,
  );
  assert.equal(
    (await selectQuestionByQid({ course_id: course.id, qid: 'test/question' }))
      .copied_from_question_id,
    source.id,
  );
  const targeted = await captureDatabaseSnapshot();
  await syncCourseData(course.path);
  await sync();
  assertSnapshotsMatch(targeted, await captureDatabaseSnapshot());
});

it('uses full sync when an added question repeats an unresolved UUID', async () => {
  const source = path.join(fixture.courseOriginDir, 'questions/test/question');
  const duplicate = path.join(fixture.courseOriginDir, 'questions/duplicate');
  await fs.copy(source, duplicate);
  await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
  await execa('git', ['commit', '-m', 'Unresolved UUID fixture'], { cwd: fixture.courseOriginDir });
  await execa('git', ['pull'], { cwd: fixture.courseLiveDir });
  await syncCourseData(fixture.courseLiveDir);
  await sync();
  assert.isNull((await selectQuestionByQid({ course_id: '1', qid: 'test/question' })).uuid);
  await fs.copy(source, path.join(fixture.courseOriginDir, 'questions/third-duplicate'));
  await execa('git', ['add', '.'], { cwd: fixture.courseOriginDir });
  await execa('git', ['commit', '-m', 'Another unresolved UUID'], { cwd: fixture.courseOriginDir });
  const user = await selectUserById('1');
  const load = vi.spyOn(courseDB, 'loadFullCourse');
  const { jobPromise } = await pullAndUpdateCourse({
    course: await selectCourseById('1'),
    userId: user.id,
    authnUserId: user.id,
  });
  await jobPromise;
  expect(load).toHaveBeenCalled();
  const question = await selectQuestionByQid({ course_id: '1', qid: 'third-duplicate' });
  assert.isNull(question.uuid);
  assert.include(
    (await selectQuestionByQid({ course_id: '1', qid: 'test/question' })).sync_warnings!,
    'third-duplicate',
  );
});
