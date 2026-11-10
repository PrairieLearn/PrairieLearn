import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';
import { afterAll, afterEach, assert, beforeAll, describe, it, vi } from 'vitest';

import { b64EncodeUnicode } from '../lib/base64-util.js';
import { ensureChunksForCourseAsync, getRuntimeDirectoryForCourse } from '../lib/chunks.js';
import { config } from '../lib/config.js';
import { computeEncodedFileContentHash } from '../lib/editorUtil.js';
import { FileModifyEditor, MultiEditor, QuestionRenameEditor } from '../lib/editors.js';
import {
  recordSuccessfulCourseSync,
  selectCourseById,
  updateCourseCommitHash,
} from '../models/course.js';
import { selectQuestionByQid } from '../models/question.js';
import { selectUserById } from '../models/user.js';
import * as courseDB from '../sync/course-db.js';
import { getQuestionRenameScope, verifyQuestionRename } from '../sync/questionRenameSync.js';
import { CURRENT_SYNC_VERSION } from '../sync/version.js';

import { type CourseRepoFixture, createCourseRepoFixture } from './helperCourse.js';
import * as helperServer from './helperServer.js';
import { captureDatabaseSnapshot, syncCourseData } from './sync/util.js';
import { withConfig } from './utils/config.js';

describe('question QID sync with real Git', () => {
  let fixture: CourseRepoFixture;
  let qid = 'test/question';

  beforeAll(async () => {
    fixture = await createCourseRepoFixture({
      populateOrigin: async (directory) => {
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
    config.fileEditorUseGit = true;
    config.chunksGenerator = true;
    await helperServer.before(fixture.courseLiveDir)();
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try {
      await helperServer.after();
    } finally {
      await fs.remove(fixture.baseDir);
    }
  });

  async function rename(edit: 'title' | 'gradingMethod' | 'content') {
    const course = await selectCourseById('1');
    await recordSuccessfulCourseSync(course.id, {
      commitHash: await updateCourseCommitHash(course),
      version: CURRENT_SYNC_VERSION,
      chunksGenerated: true,
    });
    const user = await selectUserById('1');
    const question = await selectQuestionByQid({ course_id: course.id, qid });
    const locals = {
      course: await selectCourseById(course.id),
      user,
      authz_data: { has_course_permission_edit: true, authn_user: user },
      question,
    };
    const newQid = qid === 'test/question' ? 'renamed/nested/question' : 'test/question';
    const filePath = path.join(
      course.path,
      'questions',
      qid,
      edit === 'content' ? 'question.html' : 'info.json',
    );
    const previous = await fs.readFile(filePath, 'utf8');
    const content =
      edit === 'content'
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
        origHash: computeEncodedFileContentHash(b64EncodeUnicode(previous)),
      }),
      new QuestionRenameEditor({ locals, qid_new: newQid }),
    ]);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const job = await editor.prepareServerJob();
    await editor.executeWithServerJob(job);
    qid = newQid;
    return { load, question, course };
  }

  it('preserves identity and assessment associations, matching full sync after a nested rename and title edit', async () => {
    const before = await captureDatabaseSnapshot();
    const { load, question, course } = await rename('title');
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
      assert.notInclude(JSON.stringify(info.zones), 'test/question');
    }
    assert.isFalse(await fs.pathExists(path.join(course.path, 'questions/test/question')));
    const result = await syncCourseData(course.path);
    assert.equal(result.status, 'complete');
    const full = await captureDatabaseSnapshot();
    for (const table of Object.keys(full) as (keyof typeof full)[]) {
      assert.sameDeepMembers<unknown>(full[table], targeted[table]);
    }
  });

  it.each(['gradingMethod', 'content'] as const)(
    'uses full sync when a rename also changes %s',
    async (edit) => {
      const { load, question, course } = await rename(edit);
      assert.isAbove(load.mock.calls.length, 0);
      const renamed = await selectQuestionByQid({ course_id: course.id, qid });
      assert.equal(renamed.id, question.id);
      if (edit === 'gradingMethod') assert.equal(renamed.grading_method, 'Manual');
    },
  );

  it('excludes __proto__ from the fast path', async () => {
    const course = await selectCourseById('1');
    assert.isNull(await getQuestionRenameScope(course, qid, '__proto__'));
  });

  it('rejects a copy that keeps the original question directory', async () => {
    const directory = path.join(fixture.baseDir, 'copy-check');
    await execa('git', ['clone', fixture.courseLiveDir, directory]);
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
    assert.equal(baseline.status, 'complete');
    const original = await selectQuestionByQid({ course_id: course.id, qid });
    assert.isNull(original.uuid);
    const { load } = await rename('title');
    assert.isAbove(load.mock.calls.length, 0);
    const duplicate = await selectQuestionByQid({ course_id: course.id, qid: 'duplicate-uuid' });
    assert.include(duplicate.sync_warnings!, qid);
    assert.notInclude(duplicate.sync_warnings!, oldQid);
  });
});
