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
  QuestionTagSchema,
  TagSchema,
  TopicSchema,
  type User,
} from '../lib/db-types.js';
import { getOriginalHash } from '../lib/editorUtil.js';
import {
  FileModifyEditor,
  MultiEditor,
  QuestionRenameEditor,
  classifyEditOutcome,
} from '../lib/editors.js';
import { features } from '../lib/features/index.js';
import { selectJobsByJobSequenceId } from '../lib/server-jobs.js';
import { selectAssessmentQuestionByQuestionId } from '../models/assessment-question.js';
import * as courseModel from '../models/course.js';
import { getCourseCommitHash, selectCourseById, updateCourseColumn } from '../models/course.js';
import * as questionModel from '../models/question.js';
import { selectQuestionByQid, updateQuestion } from '../models/question.js';
import { selectSharingSetsForQuestion } from '../models/sharing-set.js';
import { selectTagsByQuestionId } from '../models/tags.js';
import { selectTopicsByCourseId } from '../models/topics.js';
import { selectOrInsertUserByUid } from '../models/user.js';
import { assessmentDependenciesRequireFullSync } from '../sync/assessmentDependencies.js';
import * as courseDB from '../sync/course-db.js';
import * as questionSync from '../sync/questionSync.js';

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
    data.questions[qid] = {
      ...data.questions[util.QUESTION_ID],
      uuid: randomUUID(),
      dependencies: {},
    };
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

  async function save(
    targetPath = filePath,
    content = '<p>Updated</p>',
    mode: 'file' | 'settings' | 'rename' = 'file',
  ) {
    const course = await selectCourseById(courseId);
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
      origHash: (await getOriginalHash(targetPath))!,
    });
    const question = await selectQuestionByQid({ course_id: courseId, qid });
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
        JSON.stringify({
          ...info,
          sharePublicly: true,
          title: 'Changed title',
          gradingMethod: 'Manual',
        }),
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
    const plan = vi.spyOn(questionSync, 'getQuestionSyncPlan');
    const metadataBefore = await util.dumpTableWithSchema('questions', QuestionSchema);
    const operation = await save();
    let plansWhenPushed: number | undefined;
    await operation.run({
      beforeWrite: async (job) => {
        const exec = job.exec.bind(job);
        vi.spyOn(job, 'exec').mockImplementation(async (file, args, options) => {
          const result = await exec(file, args, options);
          if (file === 'git' && args[0] === 'push') plansWhenPushed = plan.mock.calls.length;
          return result;
        });
      },
    });
    assert.equal(plansWhenPushed, 0);
    expect(plan).toHaveBeenCalledTimes(1);
    assert.equal(await fs.readFile(filePath, 'utf8'), '<p>Updated</p>');
    expect(load).not.toHaveBeenCalled();
    expect(targeted).toHaveBeenCalledExactlyOnceWith({
      coursePath: courseDir,
      courseId,
      qids: [qid],
      replacedQids: [qid],
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

  it.each(['file', 'settings', 'rename'] as const)(
    'syncs a title-only %s edit with nested metadata without loading the course',
    async (mode) => {
      config.chunksGenerator = true;
      const load = vi.spyOn(courseDB, 'loadFullCourse');
      const targeted = vi.spyOn(chunks, 'prepareQuestionContentChunks');
      const before = await util.dumpTableWithSchema('questions', QuestionSchema);
      const infoPath = path.join(path.dirname(filePath), 'info.json');
      const info = await fs.readJson(infoPath);
      const operation = await save(infoPath, JSON.stringify({ ...info, title: 'New title' }), mode);
      await operation.run();
      expect(load).not.toHaveBeenCalled();
      expect(targeted).toHaveBeenCalledExactlyOnceWith({
        coursePath: courseDir,
        courseId,
        qids: [qid],
        replacedQids: [qid],
      });
      assert.sameDeepMembers(
        await util.dumpTableWithSchema('questions', QuestionSchema),
        before.map((question) =>
          question.qid === qid ? { ...question, title: 'New title' } : question,
        ),
      );
      assert.equal(
        (await selectCourseById(courseId)).commit_hash,
        await getCourseCommitHash(courseDir),
      );
      assert.equal(classifyEditOutcome((await operation.result()).data), 'success');
    },
  );

  it('syncs current question settings and catalogs together, restores defaults, and matches full sync', async () => {
    const infoPath = path.join(path.dirname(filePath), 'info.json');
    const original = await fs.readJson(infoPath);
    const changed = {
      ...original,
      title: 'Updated settings',
      tags: ['new-settings-tag'],
      topic: 'New settings topic',
      singleVariant: true,
      showCorrectAnswer: false,
      partialCredit: false,
      authors: [' editor@example.com ', 'editor@example.com'],
      comment: 'Updated question settings',
      dependencies: { clientFilesQuestionStyles: ['style.css'] },
      workspaceOptions: {
        image: 'prairielearn/workspace-vscode',
        port: 8080,
        home: '/home/student',
        args: ['code', '--port', '8080'],
        rewriteUrl: false,
        gradedFiles: ['answer.py'],
        enableNetworking: true,
        environment: { COURSE_NAME: 'test' },
      },
      externalGradingOptions: {
        image: 'prairielearn/grader-python',
        entrypoint: ['python3', 'test.py'],
        serverFilesCourse: [],
        timeout: config.externalGradingMaximumTimeout + 1,
        enableNetworking: true,
        environment: { TEST_MODE: '1' },
      },
    };
    await fs.outputFile(
      path.join(fixture.courseOriginDir, 'questions', qid, 'clientFilesQuestion/style.css'),
      'body { color: black; }',
    );
    await commitOriginAndSync(fixture, 'Add question stylesheet');
    await sync();
    const beforeQuestions = await util.dumpTableWithSchema('questions', QuestionSchema);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const operation = await save(infoPath, JSON.stringify(changed));
    await operation.run();
    expect(load).not.toHaveBeenCalled();
    const question = await selectQuestionByQid({ course_id: courseId, qid });
    assert.isTrue(question.single_variant);
    assert.isFalse(question.show_correct_answer);
    assert.isFalse(question.partial_credit);
    assert.deepEqual(question.authors, ['editor@example.com']);
    assert.equal(question.workspace_args, 'code --port 8080');
    assert.equal(question.external_grading_entrypoint, 'python3 test.py');
    assert.equal(question.external_grading_timeout, config.externalGradingMaximumTimeout);
    assert.include(question.sync_warnings!, 'has been limited');
    assert.include((await operation.result()).output, 'has been limited');
    assert.sameDeepMembers(
      (await util.dumpTableWithSchema('questions', QuestionSchema)).filter(
        (q) => q.id !== question.id,
      ),
      beforeQuestions.filter((q) => q.id !== question.id),
    );
    await withConfig(
      { chunksConsumer: true, chunksConsumerDirectory: path.join(fixture.baseDir, 'runtime') },
      async () => {
        await chunks.ensureChunksForCourseAsync(courseId, {
          type: 'question',
          questionId: question.id,
        });
        const runtimePath = chunks.getRuntimeDirectoryForCourse({ id: courseId, path: courseDir });
        assert.deepEqual(
          await fs.readJson(path.join(runtimePath, 'questions', qid, 'info.json')),
          changed,
        );
      },
    );
    const targeted = await metadataSnapshot();
    await util.syncCourseData(courseDir);
    (await metadataSnapshot()).forEach((rows, index) =>
      assert.sameDeepMembers<unknown>(rows, targeted[index]),
    );
    await sync();
    load.mockClear();
    await (await save(infoPath, JSON.stringify(original))).run();
    expect(load).not.toHaveBeenCalled();
    const restored = await metadataSnapshot();
    await util.syncCourseData(courseDir);
    (await metadataSnapshot()).forEach((rows, index) =>
      assert.sameDeepMembers<unknown>(rows, restored[index]),
    );
  });

  it('uses full sync for authored deprecated settings even when their effective default is unchanged', async () => {
    const originPath = path.join(fixture.courseOriginDir, 'questions', qid, 'info.json');
    const original = await fs.readJson(originPath);
    const info = { ...original, externalGradingOptions: { image: 'prairielearn/grader-python' } };
    await fs.writeJson(originPath, info);
    await commitOriginAndSync(fixture, 'Configure external grader image');
    await sync();
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    await (
      await save(
        path.join(path.dirname(filePath), 'info.json'),
        JSON.stringify({
          ...info,
          singleVariant: true,
          externalGradingOptions: { ...info.externalGradingOptions, enabled: true },
        }),
      )
    ).run();
    expect(load).toHaveBeenCalled();
    assert.isTrue((await selectQuestionByQid({ course_id: courseId, qid })).single_variant);
  });

  it('uses full sync to record semantic errors in settings without applying invalid metadata', async () => {
    const originPath = path.join(fixture.courseOriginDir, 'questions', qid, 'info.json');
    const original = await fs.readJson(originPath);
    const info = {
      ...original,
      gradingMethod: 'External',
      externalGradingOptions: { image: 'prairielearn/grader-python' },
    };
    await fs.writeJson(originPath, info);
    await commitOriginAndSync(fixture, 'Enable external grading');
    await sync();
    const before = await selectQuestionByQid({ course_id: courseId, qid });
    const { externalGradingOptions: _options, ...withoutOptions } = info;
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    await expect(
      (
        await save(
          path.join(path.dirname(filePath), 'info.json'),
          JSON.stringify({ ...withoutOptions, singleVariant: true }),
        )
      ).run(),
    ).rejects.toThrow('One or more JSON files');
    expect(load).toHaveBeenCalled();
    const after = await selectQuestionByQid({ course_id: courseId, qid });
    assert.equal(after.single_variant, before.single_variant);
    assert.equal(after.external_grading_image, before.external_grading_image);
    assert.include(after.sync_errors!, 'externalGradingOptions');
  });

  it('fully syncs question metadata and preserves JSON errors during content saves', async () => {
    const jsonPath = path.join(path.dirname(filePath), 'info.json');
    const info = await fs.readJson(jsonPath);
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const operation = await save(
      jsonPath,
      JSON.stringify({
        ...info,
        title: 'Changed title',
        singleVariant: true,
        gradingMethod: 'Manual',
      }),
    );
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

  it('recovers pending metadata atomically while preserving unrelated question errors', async () => {
    config.chunksGenerator = true;
    const otherPath = path.join(courseDir, 'questions', util.QUESTION_ID, 'info.json');
    const other = await fs.readJson(otherPath);
    await expect(
      (await save(otherPath, JSON.stringify({ ...other, title: 123 }))).run(),
    ).rejects.toThrow('One or more JSON files');
    const infoPath = path.join(path.dirname(filePath), 'info.json');
    const original = await fs.readJson(infoPath);
    const pending = {
      ...original,
      singleVariant: true,
      tags: ['numeric', 'recovery-tag'],
      topic: 'Recovery topic',
    };
    await expect(
      (await save(infoPath, JSON.stringify({ ...pending, title: 123 }))).run(),
    ).rejects.toThrow('One or more JSON files');
    const beforeMetadata = await metadataSnapshot();
    const before = beforeMetadata[3];
    const beforeChunks = await util.dumpTableWithSchema('chunks', ChunkSchema);
    const previousCommit = (await selectCourseById(courseId)).commit_hash;
    assert.isFalse((await selectQuestionByQid({ course_id: courseId, qid })).single_variant);
    const fixed = JSON.stringify({ ...pending, title: 'Recovered title' });
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const checkpoint = vi
      .spyOn(courseModel, 'updateCourseCommitHash')
      .mockRejectedValueOnce(new Error('Checkpoint failed'));
    await expect((await save(infoPath, fixed)).run()).rejects.toThrow('Checkpoint failed');
    assert.deepEqual(await metadataSnapshot(), beforeMetadata);
    assert.deepEqual(await util.dumpTableWithSchema('chunks', ChunkSchema), beforeChunks);
    assert.equal((await selectCourseById(courseId)).commit_hash, previousCommit);
    checkpoint.mockRestore();
    await (await save(infoPath, fixed)).run();
    expect(load).not.toHaveBeenCalled();
    const recovered = await selectQuestionByQid({ course_id: courseId, qid });
    assert.equal(recovered.title, 'Recovered title');
    assert.isTrue(recovered.single_variant);
    assert.isNull(recovered.sync_errors);
    assert.sameMembers(
      (await selectTagsByQuestionId(recovered.id)).map((tag) => tag.name),
      pending.tags,
    );
    assert.equal(
      (await selectTopicsByCourseId(courseId)).find((topic) => topic.id === recovered.topic_id)
        ?.name,
      pending.topic,
    );
    assert.sameDeepMembers(
      await util.dumpTableWithSchema('questions', QuestionSchema),
      before.map((question) => (question.qid === qid ? recovered : question)),
    );
    assert.equal(
      (await selectCourseById(courseId)).commit_hash,
      await getCourseCommitHash(courseDir),
    );
  });

  it('retains validation errors and unapplied fields when question recovery is still invalid', async () => {
    const infoPath = path.join(path.dirname(filePath), 'info.json');
    const original = await fs.readJson(infoPath);
    await expect(
      (
        await save(infoPath, JSON.stringify({ ...original, title: 123, singleVariant: true }))
      ).run(),
    ).rejects.toThrow('One or more JSON files');
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    const operation = await save(
      infoPath,
      JSON.stringify({
        ...original,
        title: 'Valid title',
        singleVariant: true,
        gradingMethod: 'External',
      }),
    );
    await expect(operation.run()).rejects.toThrow('One or more JSON files');
    expect(load).not.toHaveBeenCalled();
    const question = await selectQuestionByQid({ course_id: courseId, qid });
    assert.equal(question.title, original.title);
    assert.isFalse(question.single_variant);
    assert.include(question.sync_errors!, 'externalGradingOptions');
    assert.equal(classifyEditOutcome((await operation.result()).data), 'sync_json_errors');
    assert.equal(
      (await selectCourseById(courseId)).commit_hash,
      await getCourseCommitHash(courseDir),
    );
  });

  it('uses full sync to clear dependent assessment errors when recovering question preferences', async () => {
    const infoPath = path.join(path.dirname(filePath), 'info.json');
    const original = await fs.readJson(infoPath);
    const valid = { ...original, preferences: { num: { type: 'number', default: 1 } } };
    await (await save(infoPath, JSON.stringify(valid))).run();
    const assessmentPath = path.join(
      courseDir,
      'courseInstances',
      util.COURSE_INSTANCE_ID,
      'assessments',
      util.ASSESSMENT_ID,
      'infoAssessment.json',
    );
    const assessment = await fs.readJson(assessmentPath);
    await (
      await save(
        assessmentPath,
        JSON.stringify({
          ...assessment,
          zones: [{ questions: [{ id: qid, points: 10, preferences: { num: 2 } }] }],
        }),
      )
    ).run();
    const selectedAssessment = async () =>
      (await util.dumpTableWithSchema('assessments', AssessmentSchema)).find(
        (a) => a.tid === util.ASSESSMENT_ID,
      )!;
    assert.isNull((await selectedAssessment()).sync_errors);
    await expect(
      (await save(infoPath, JSON.stringify({ ...valid, title: 123 }))).run(),
    ).rejects.toThrow('One or more JSON files');
    assert.include(
      (await selectedAssessment()).sync_errors!,
      'does not define a preferences schema',
    );
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    await (await save(infoPath, JSON.stringify({ ...valid, title: 'Recovered title' }))).run();
    expect(load).toHaveBeenCalled();
    assert.isNull((await selectQuestionByQid({ course_id: courseId, qid })).sync_errors);
    assert.isNull((await selectedAssessment()).sync_errors);
    assert.equal(
      (await selectCourseById(courseId)).commit_hash,
      await getCourseCommitHash(courseDir),
    );
  });

  it('clears dependent assessment errors when preferences only existed in failed metadata', async () => {
    const infoPath = path.join(path.dirname(filePath), 'info.json');
    const original = await fs.readJson(infoPath);
    const assessmentPath = path.join(
      courseDir,
      'courseInstances',
      util.COURSE_INSTANCE_ID,
      'assessments',
      util.ASSESSMENT_ID,
      'infoAssessment.json',
    );
    const assessment = await fs.readJson(assessmentPath);
    await (
      await save(
        assessmentPath,
        JSON.stringify({ ...assessment, zones: [{ questions: [{ id: qid, points: 10 }] }] }),
      )
    ).run();
    const selectedAssessment = async () =>
      (await util.dumpTableWithSchema('assessments', AssessmentSchema)).find(
        (a) => a.tid === util.ASSESSMENT_ID,
      )!;
    assert.isNull((await selectedAssessment()).sync_errors);
    await expect(
      (
        await save(
          infoPath,
          JSON.stringify({
            ...original,
            preferences: { num: { type: 'number', default: 1, enum: [2] } },
          }),
        )
      ).run(),
    ).rejects.toThrow('One or more JSON files');
    const failed = await selectQuestionByQid({ course_id: courseId, qid });
    assert.isNotNull(failed.sync_errors);
    assert.isNull(failed.preferences_schema);
    assert.include((await selectedAssessment()).sync_errors!, 'preferences/num');
    const load = vi.spyOn(courseDB, 'loadFullCourse');
    await (await save(infoPath, JSON.stringify({ ...original, title: 'Recovered title' }))).run();
    expect(load).toHaveBeenCalled();
    const recovered = await selectQuestionByQid({ course_id: courseId, qid });
    assert.equal(recovered.title, 'Recovered title');
    assert.isNull(recovered.sync_errors);
    assert.isNull(recovered.preferences_schema);
    const repairedAssessment = await selectedAssessment();
    assert.isNull(repairedAssessment.sync_errors);
    assert.equal(
      (await selectCourseById(courseId)).commit_hash,
      await getCourseCommitHash(courseDir),
    );
    await util.syncCourseData(courseDir);
    assert.deepEqual(await selectQuestionByQid({ course_id: courseId, qid }), recovered);
    assert.deepEqual(await selectedAssessment(), repairedAssessment);
  });

  it('uses full sync to remove existing sharing-set membership during error recovery', async () => {
    await withConfig(
      { features: { 'question-sharing': true }, checkSharingOnSync: true },
      async () => {
        const courseInfoPath = path.join(courseDir, 'infoCourse.json');
        const courseInfo = await fs.readJson(courseInfoPath);
        await (
          await save(
            courseInfoPath,
            JSON.stringify({
              ...courseInfo,
              sharingSets: [{ name: 'shared', description: 'Shared questions' }],
            }),
          )
        ).run();
        const infoPath = path.join(path.dirname(filePath), 'info.json');
        const original = await fs.readJson(infoPath);
        const shared = { ...original, sharingSets: ['shared'] };
        await (await save(infoPath, JSON.stringify(shared))).run();
        const question = await selectQuestionByQid({ course_id: courseId, qid });
        const memberships = () =>
          selectSharingSetsForQuestion({ course_id: courseId, question_id: question.id });
        assert.isTrue((await memberships())[0].in_set);
        await expect(
          (await save(infoPath, JSON.stringify({ ...shared, title: 123 }))).run(),
        ).rejects.toThrow('One or more JSON files');
        const load = vi.spyOn(courseDB, 'loadFullCourse');
        await expect(
          (
            await save(
              infoPath,
              JSON.stringify({ ...original, title: 'Recovered title', gradingMethod: 'External' }),
            )
          ).run(),
        ).rejects.toThrow('One or more JSON files');
        expect(load).toHaveBeenCalled();
        assert.isTrue((await memberships())[0].in_set);
        load.mockClear();
        await (
          await save(infoPath, JSON.stringify({ ...original, title: 'Recovered title' }))
        ).run();
        expect(load).toHaveBeenCalled();
        assert.isFalse((await memberships())[0].in_set);
        assert.isNull((await selectQuestionByQid({ course_id: courseId, qid })).sync_errors);
        assert.equal(
          (await selectCourseById(courseId)).commit_hash,
          await getCourseCommitHash(courseDir),
        );
      },
    );
  });

  async function metadataSnapshot() {
    return await Promise.all([
      util.dumpTableWithSchema('tags', TagSchema),
      util.dumpTableWithSchema('topics', TopicSchema),
      util.dumpTableWithSchema('question_tags', QuestionTagSchema),
      util.dumpTableWithSchema('questions', QuestionSchema),
    ]);
  }

  it.each(['tags', 'topic'] as const)(
    'matches full sync through the %s lifecycle and error recovery',
    async (field) => {
      const infoPath = path.join(path.dirname(filePath), 'info.json');
      const load = vi.spyOn(courseDB, 'loadFullCourse');
      const values =
        field === 'tags'
          ? [['test', 'numeric', 'zz-new', 'zz-new'], []]
          : ['zz-new-topic', '', 'Another test'];
      for (const [index, value] of values.entries()) {
        const info = await fs.readJson(infoPath);
        if (index === 1) {
          // oxlint-disable-next-line vitest/no-conditional-expect -- Exercise recovery on removal, and ordinary saves on the other lifecycle steps.
          await expect(
            (await save(infoPath, JSON.stringify({ ...info, title: 123, [field]: value }))).run(),
          ).rejects.toThrow('One or more JSON files');
          load.mockClear();
        }
        const operation = await save(
          infoPath,
          JSON.stringify({ ...info, title: 'Updated alongside metadata', [field]: value }),
          'settings',
        );
        await operation.run();
        assert.equal(load.mock.calls.length, 0);
        assert.equal(classifyEditOutcome((await operation.result()).data), 'success');
        const targeted = await metadataSnapshot();
        await util.syncCourseData(courseDir);
        await sync();
        const full = await metadataSnapshot();
        targeted.forEach((rows, index) => assert.sameDeepMembers<unknown>(rows, full[index]));
        load.mockClear();
      }
    },
  );

  it('rolls back catalogs and associations when a metadata update fails', async () => {
    const before = await metadataSnapshot();
    const previousCommit = (await selectCourseById(courseId)).commit_hash;
    vi.spyOn(questionModel, 'syncQuestionTopic').mockRejectedValue(
      new Error('Topic update failed'),
    );
    const operation = await save(
      path.join(path.dirname(filePath), 'info.json'),
      JSON.stringify({
        ...(await fs.readJson(path.join(path.dirname(filePath), 'info.json'))),
        tags: ['new-tag'],
        topic: 'New topic',
        title: 'New title',
      }),
      'settings',
    );
    await expect(operation.run()).rejects.toThrow('Topic update failed');
    const after = await metadataSnapshot();
    before.forEach((rows, index) => assert.sameDeepMembers<unknown>(rows, after[index]));
    assert.equal((await selectCourseById(courseId)).commit_hash, previousCommit);
    assert.equal(classifyEditOutcome((await operation.result()).data), 'sync_failed');
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

  it('includes remote title changes during push recovery without loading the course', async () => {
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
    expect(load).not.toHaveBeenCalled();
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

  it('does not sync a local candidate when neither push nor fetch confirms it', async () => {
    const before = await selectCourseById(courseId);
    const operation = await save();
    await expect(
      operation.run({
        beforeWrite: async (job) => {
          const exec = job.exec.bind(job);
          vi.spyOn(job, 'exec').mockImplementation(async (file, args, options) => {
            if (file === 'git' && args[0] === 'push') throw new Error('Push timed out');
            if (file === 'git' && args[0] === 'fetch') throw new Error('Fetch timed out');
            return await exec(file, args, options);
          });
        },
      }),
    ).rejects.toThrow('Fetch timed out');
    assert.equal(classifyEditOutcome((await operation.result()).data), 'save_failed');
    assert.equal(await getCourseCommitHash(courseDir), before.commit_hash);
    assert.equal((await selectCourseById(courseId)).commit_hash, before.commit_hash);
    assert.equal(await fs.readFile(filePath, 'utf8'), originContents);
  });

  it('syncs a commit confirmed by fetch after the push response was lost', async () => {
    const operation = await save();
    let pushes = 0;
    await operation.run({
      beforeWrite: async (job) => {
        const exec = job.exec.bind(job);
        vi.spyOn(job, 'exec').mockImplementation(async (file, args, options) => {
          const result = await exec(file, args, options);
          if (file === 'git' && args[0] === 'push') {
            pushes++;
            throw new Error('Push timed out after reaching the remote');
          }
          return result;
        });
      },
    });
    assert.equal(pushes, 1);
    assert.equal(classifyEditOutcome((await operation.result()).data), 'success');
    assert.equal(
      (await selectCourseById(courseId)).commit_hash,
      await getCourseCommitHash(fixture.courseOriginDir),
    );
  });

  it('checks pending sharing changes before pushing a reapplied content edit', async () => {
    await withConfig(
      { checkSharingOnSync: true, features: { 'question-sharing': true } },
      async () => {
        const courseInfoPath = path.join(courseDir, 'infoCourse.json');
        const courseInfo = await fs.readJson(courseInfoPath);
        await (
          await save(
            courseInfoPath,
            JSON.stringify({
              ...courseInfo,
              sharingSets: [{ name: 'shared', description: 'Shared questions' }],
            }),
          )
        ).run();
        const infoPath = path.join(path.dirname(filePath), 'info.json');
        const info = await fs.readJson(infoPath);
        await (await save(infoPath, JSON.stringify({ ...info, sharingSets: ['shared'] }))).run();
        const before = await selectCourseById(courseId);

        await execa('git', ['pull', '--ff-only'], { cwd: fixture.courseDevDir });
        const remoteInfo = path.join(fixture.courseDevDir, 'infoCourse.json');
        await fs.writeJson(remoteInfo, { ...courseInfo, sharingSets: [] });
        await execa('git', ['add', remoteInfo], { cwd: fixture.courseDevDir });
        await execa('git', ['commit', '-m', 'Remove a sharing set still in use'], {
          cwd: fixture.courseDevDir,
        });
        await execa('git', ['push'], { cwd: fixture.courseDevDir });
        const remoteRevision = await getCourseCommitHash(fixture.courseDevDir);

        const operation = await save();
        await expect(operation.run()).rejects.toThrow('Invalid sharing operation');
        assert.equal(classifyEditOutcome((await operation.result()).data), 'save_failed');
        assert.equal(await getCourseCommitHash(fixture.courseOriginDir), remoteRevision);
        assert.equal((await selectCourseById(courseId)).commit_hash, before.commit_hash);
        assert.equal(await fs.readFile(filePath, 'utf8'), originContents);
      },
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
      const changed = JSON.stringify({
        ...JSON.parse(original),
        title: 'Changed title',
        singleVariant: true,
      });
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
