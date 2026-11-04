import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { b64EncodeUnicode } from '../lib/base64-util.js';
import { config } from '../lib/config.js';
import { computeEncodedFileContentHash } from '../lib/editorUtil.js';
import { FileModifyEditor, MultiEditor, QuestionRenameEditor } from '../lib/editors.js';
import { REPOSITORY_ROOT_PATH } from '../lib/paths.js';
import { invalidateCourseSync, selectCourseById } from '../models/course.js';
import { selectQuestionByQid } from '../models/question.js';
import { selectTagsByQuestionId } from '../models/tags.js';
import { selectTopicsByCourseId } from '../models/topics.js';
import { selectUserById } from '../models/user.js';

import { createCourseRepoFixture } from './helperCourse.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const outputPath = process.env.PL_SAVE_BENCHMARK_OUTPUT;
const realGit = process.env.PL_SAVE_BENCHMARK_REAL_GIT === '1';
const action = z
  .enum(['content', 'title', 'tags', 'topic', 'qid'])
  .parse(process.env.PL_SAVE_BENCHMARK_ACTION ?? 'content');
const metadataEdit = action !== 'content';
const baselineOnly = process.env.PL_SAVE_BENCHMARK_BASELINE === '1';
const questionCount = 500;
const assessmentCount = 25;
const warmupCount = 3;
const sampleCount = 20;

interface Sample {
  mode: 'full' | 'targeted' | 'local';
  iteration: number;
  warmup: boolean;
  durationMs: number;
  error: string | null;
  jobOutput: string[];
}

function summarize(samples: Sample[]) {
  const durations = samples
    .filter((sample) => !sample.warmup && sample.error === null)
    .map((sample) => sample.durationMs)
    .sort((a, b) => a - b);
  if (durations.length === 0) return null;
  const middle = Math.floor(durations.length / 2);
  return {
    successfulSamples: durations.length,
    medianMs:
      durations.length % 2 === 0
        ? (durations[middle - 1] + durations[middle]) / 2
        : durations[middle],
    p95Ms: durations[Math.ceil(durations.length * 0.95) - 1],
    minMs: durations[0],
    maxMs: durations[durations.length - 1],
  };
}

// Opt in explicitly: this measures editor processing and is not a CI timing assertion.
describe.skipIf(!outputPath)('question content save benchmark', () => {
  let temporaryDirectory: string;
  let coursePath: string;
  let serverStarted = false;

  async function populateCourse(coursePath: string) {
    await fs.copy(path.join(import.meta.dirname, 'testFileEditor/courseTemplate'), coursePath);

    const questionsPath = path.join(coursePath, 'questions');
    for (let index = 1; index < questionCount; index++) {
      await fs.outputJson(path.join(questionsPath, `benchmark-${index}`, 'info.json'), {
        uuid: randomUUID(),
        title: `Benchmark question ${index}`,
        type: 'v3',
        topic: 'Test',
        tags: ['tbretl'],
      });
    }
    for (let index = 1; index < assessmentCount; index++) {
      await fs.outputJson(
        path.join(
          coursePath,
          'courseInstances/Fa18/assessments',
          `benchmark-${index}`,
          'infoAssessment.json',
        ),
        {
          uuid: randomUUID(),
          type: 'Homework',
          title: `Benchmark assessment ${index}`,
          set: 'Homework',
          number: String(index + 1),
          zones: [{ questions: [{ id: 'test/question', points: 10 }] }],
        },
      );
    }
  }

  beforeAll(async () => {
    if (realGit) {
      const fixture = await createCourseRepoFixture({ populateOrigin: populateCourse });
      temporaryDirectory = fixture.baseDir;
      coursePath = fixture.courseLiveDir;
    } else {
      temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'pl-save-benchmark-'));
      const repositoryPath = path.join(temporaryDirectory, 'repository');
      // Supply a real HEAD for commit tracking without creating commits or pushing.
      await execa('git', [
        'clone',
        '--shared',
        '--no-checkout',
        REPOSITORY_ROOT_PATH,
        repositoryPath,
      ]);
      coursePath = path.join(repositoryPath, 'benchmarkCourse');
      await populateCourse(coursePath);
    }
    config.fileEditorUseGit = realGit;
    config.chunksGenerator = realGit;
    await helperServer.before(coursePath)();
    serverStarted = true;
  }, 120_000);

  afterAll(async () => {
    try {
      if (serverStarted) await helperServer.after();
    } finally {
      if (temporaryDirectory) await fs.remove(temporaryDirectory);
    }
  });

  it('records repeated editor saves and existing sync phase logs', async () => {
    assert.isDefined(outputPath);
    const counts = await sqldb.queryRow(
      sql.select_course_counts,
      { course_id: '1' },
      z.object({ questions: z.number(), assessments: z.number() }),
    );
    assert.equal(counts.questions, questionCount);
    assert.equal(counts.assessments, assessmentCount);
    const { stdout: revision } = await execa('git', ['rev-parse', 'HEAD'], {
      cwd: REPOSITORY_ROOT_PATH,
    });
    const user = await selectUserById('1');
    let currentQid = 'test/question';
    const filePath = path.join(
      coursePath,
      'questions/test/question',
      metadataEdit ? 'info.json' : 'question.html',
    );
    const originalContent = await fs.readFile(filePath, 'utf8');
    const samples: Sample[] = [];

    const schedule = Array.from({ length: warmupCount + sampleCount }, (_, pair) =>
      realGit
        ? baselineOnly
          ? (['full'] as const)
          : pair % 2 === 0
            ? (['full', 'targeted'] as const)
            : (['targeted', 'full'] as const)
        : (['local'] as const),
    ).flat();
    for (const [iteration, mode] of schedule.entries()) {
      if (mode === 'full') await invalidateCourseSync('1');
      const course = await selectCourseById('1');
      const currentFilePath =
        action === 'qid' ? path.join(coursePath, 'questions', currentQid, 'info.json') : filePath;
      const previousContent = b64EncodeUnicode(await fs.readFile(currentFilePath, 'utf8'));
      const nextContent = metadataEdit
        ? JSON.stringify({
            ...JSON.parse(originalContent),
            ...(action === 'title'
              ? { title: `Benchmark title ${iteration % 2}` }
              : action === 'tags'
                ? { tags: ['tbretl', `benchmark-tag-${iteration % 2}`] }
                : { topic: `Benchmark topic ${iteration % 2}` }),
          })
        : `${originalContent}\n<!-- save benchmark ${iteration % 2} -->\n`;
      const fileEditor = new FileModifyEditor({
        locals: {
          course,
          user,
          authz_data: { has_course_permission_edit: true, authn_user: user },
        },
        container: { rootPath: coursePath, invalidRootPaths: [] },
        filePath: currentFilePath,
        editContents: b64EncodeUnicode(nextContent),
        origHash: computeEncodedFileContentHash(previousContent),
      });
      const question = await selectQuestionByQid({ course_id: course.id, qid: currentQid });
      const nextQid = currentQid === 'test/question' ? 'renamed/question' : 'test/question';
      const editor =
        action === 'qid'
          ? new QuestionRenameEditor({
              locals: {
                course,
                user,
                question,
                authz_data: { has_course_permission_edit: true, authn_user: user },
              },
              qid_new: nextQid,
            })
          : metadataEdit
            ? new MultiEditor(
                {
                  locals: {
                    course,
                    user,
                    authz_data: { has_course_permission_edit: true, authn_user: user },
                  },
                  description: 'Update question settings',
                },
                [
                  fileEditor,
                  new QuestionRenameEditor({
                    locals: {
                      course,
                      user,
                      question,
                      authz_data: { has_course_permission_edit: true, authn_user: user },
                    },
                    qid_new: 'test/question',
                  }),
                ],
              )
            : fileEditor;
      const start = performance.now();
      let error: string | null = null;
      const job = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(job);
      } catch (err) {
        error = String(err);
      }
      const durationMs = performance.now() - start;
      if (error === null) {
        if (action === 'qid') {
          currentQid = nextQid;
          const renamed = await selectQuestionByQid({ course_id: course.id, qid: currentQid });
          assert.equal(renamed.id, question.id);
          assert.equal(renamed.directory, currentQid);
          assert.isFalse(await fs.pathExists(path.join(coursePath, 'questions', question.qid!)));
        } else {
          assert.equal(await fs.readFile(filePath, 'utf8'), nextContent);
        }
        if (metadataEdit) {
          const updated = await selectQuestionByQid({ course_id: course.id, qid: currentQid });
          if (action === 'title') assert.equal(updated.title, `Benchmark title ${iteration % 2}`);
          if (action === 'tags') {
            const tags = await selectTagsByQuestionId(updated.id);
            assert.sameMembers(
              tags.map((tag) => tag.name),
              ['tbretl', `benchmark-tag-${iteration % 2}`],
            );
          }
          if (action === 'topic') {
            const topics = await selectTopicsByCourseId(course.id);
            assert.equal(
              topics.find((topic) => topic.id === updated.topic_id)!.name,
              `Benchmark topic ${iteration % 2}`,
            );
          }
        }
      }
      const jobOutput = await sqldb.queryRows(
        sql.select_job_output,
        { job_sequence_id: job.jobSequenceId },
        z.object({ output: z.string().nullable() }),
      );
      if (realGit && error === null) {
        assert.equal(
          jobOutput.some(
            (row) => row.output?.includes('Syncing question ') && row.output.includes(' only:'),
          ),
          mode === 'targeted',
        );
      }
      samples.push({
        mode,
        iteration,
        warmup: iteration < warmupCount * (realGit && !baselineOnly ? 2 : 1),
        durationMs,
        error,
        jobOutput: jobOutput.map((row) => row.output ?? ''),
      });
      await fs.outputJson(
        outputPath,
        {
          recordedAt: new Date().toISOString(),
          action: `question-${action}`,
          baselineOnly,
          revision,
          node: process.version,
          platform: `${os.platform()} ${os.release()} ${os.arch()}`,
          cpu: os.cpus()[0].model,
          mode: realGit ? 'real-git-local-remote-real-s3' : 'editor-processing-no-git-no-chunks',
          limitation: realGit
            ? 'Includes real local Git, server jobs, database, and chunk publication; excludes GitHub network, HTTP, and browser latency.'
            : 'Does not measure Git, chunk publication, HTTP, or browser latency; not a production fast-path comparison.',
          questionCount,
          assessmentCount,
          warmupCount,
          sampleCount,
          summary: realGit
            ? Object.fromEntries(
                ['full', 'targeted'].map((mode) => [
                  mode,
                  summarize(samples.filter((sample) => sample.mode === mode)),
                ]),
              )
            : summarize(samples),
          samples,
        },
        { spaces: 2 },
      );
      assert.isNull(error);
    }
  }, 120_000);
});
