import * as path from 'node:path';

import { TRPCClientError } from '@trpc/client';
import { execa } from 'execa';
import fs from 'fs-extra';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { getCourseTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { EXAMPLE_COURSE_PATH } from '../lib/paths.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import { selectQuestionById } from '../models/question.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';
import type { CourseRouter } from '../trpc/course/trpc.js';

import {
  type CourseRepoFixture,
  createCourseRepoFixture,
  updateCourseRepository,
} from './helperCourse.js';
import * as helperServer from './helperServer.js';

const siteUrl = `http://localhost:${config.serverPort}`;
const courseTemplateDir = path.join(import.meta.dirname, 'testFileEditor', 'courseTemplate');
const sql = sqldb.loadSqlEquiv(import.meta.url);
const DraftQuestionMetadataSchema = z.object({ id: IdSchema });
const InfoJsonSchema = z.object({
  title: z.string(),
  topic: z.string(),
  shareSourcePublicly: z.unknown().optional(),
});

let courseRepo: CourseRepoFixture;

function createTrpcClient() {
  const csrfToken = generatePrefixCsrfToken(
    { url: getCourseTrpcUrl('1'), authn_user_id: '2' },
    config.secretKey,
  );

  return createCourseTrpcClient({
    csrfToken,
    courseId: '1',
    urlBase: siteUrl,
    extraHeaders: { cookie: 'pl_test_user=test_instructor' },
  });
}

async function selectDraftQuestionMetadata(questionId: string) {
  return await sqldb.queryOptionalRow(
    sql.select_draft_question_metadata,
    { question_id: questionId },
    DraftQuestionMetadataSchema,
  );
}

async function assertDraftQuestion({
  questionId,
  draftNumber,
}: {
  questionId: string;
  draftNumber: number;
}) {
  const question = await selectQuestionById(questionId);
  const qid = `__drafts__/draft_${draftNumber}`;

  assert.equal(question.qid, qid);
  assert.equal(question.title, `draft #${draftNumber}`);
  assert.isTrue(question.draft);
  assert.isNotNull(await selectDraftQuestionMetadata(questionId));

  return {
    qid,
    path: path.join(courseRepo.courseLiveDir, 'questions', ...qid.split('/')),
  };
}

async function readInfoJson(questionPath: string) {
  return InfoJsonSchema.parse(await fs.readJson(path.join(questionPath, 'info.json')));
}

async function assertCreateDraftEditorJobFailed(promise: Promise<unknown>) {
  try {
    await promise;
    assert.fail('Expected mutation to throw');
  } catch (err: unknown) {
    assert.instanceOf(err, TRPCClientError);
    assert.equal((err as TRPCClientError<CourseRouter>).data?.code, 'BAD_REQUEST');
    assert.include((err as Error).message, 'Failed to create the draft question.');
  }
}

async function assertCreateDraftBadRequest(promise: Promise<unknown>, message: string) {
  try {
    await promise;
    assert.fail('Expected mutation to throw');
  } catch (err: unknown) {
    assert.instanceOf(err, TRPCClientError);
    assert.equal((err as TRPCClientError<CourseRouter>).data?.code, 'BAD_REQUEST');
    assert.include((err as Error).message, message);
  }
}

describe('Creating a question draft', () => {
  beforeAll(async () => {
    courseRepo = await createCourseRepoFixture(courseTemplateDir);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'instructor@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });
  });

  afterAll(helperServer.after);

  test.sequential('creates a new empty question draft', async () => {
    const trpc = createTrpcClient();
    const draft = await trpc.questions.createDraft.mutate({ startFrom: 'empty' });

    assert.match(draft.editorUrl, new RegExp(`/question/${draft.questionId}/draft$`));

    const { path: draftPath } = await assertDraftQuestion({
      questionId: draft.questionId,
      draftNumber: 1,
    });
    const questionInfo = await readInfoJson(draftPath);

    assert.equal(questionInfo.title, 'draft #1');
    assert.equal(questionInfo.topic, 'Default');
    assert.isUndefined(questionInfo.shareSourcePublicly);
    assert.isTrue(await fs.pathExists(path.join(draftPath, 'question.html')));
    assert.isTrue(await fs.pathExists(path.join(draftPath, 'server.py')));
  });

  test.sequential('creates a new question draft from the example course templates', async () => {
    const trpc = createTrpcClient();
    const draft = await trpc.questions.createDraft.mutate({
      startFrom: 'example',
      templateQid: 'template/matrix-component-input/random-graph',
    });

    assert.match(draft.editorUrl, new RegExp(`/question/${draft.questionId}/draft$`));

    const { path: draftPath } = await assertDraftQuestion({
      questionId: draft.questionId,
      draftNumber: 2,
    });
    const questionInfo = await readInfoJson(draftPath);

    assert.equal(questionInfo.title, 'draft #2');
    assert.equal(questionInfo.topic, 'Default');
    assert.isUndefined(questionInfo.shareSourcePublicly);

    const originalQuestionPath = path.join(
      EXAMPLE_COURSE_PATH,
      'questions',
      'template',
      'matrix-component-input',
      'random-graph',
    );

    assert.equal(
      await fs.readFile(path.join(draftPath, 'server.py'), 'utf8'),
      await fs.readFile(path.join(originalQuestionPath, 'server.py'), 'utf8'),
    );
    assert.equal(
      await fs.readFile(path.join(draftPath, 'question.html'), 'utf8'),
      await fs.readFile(path.join(originalQuestionPath, 'question.html'), 'utf8'),
    );
  });

  test.sequential('creates a new question draft from a course-specific template', async () => {
    const templateQid = 'template/courseTemplate';
    const templatePath = path.join(
      courseRepo.courseOriginDir,
      'questions',
      ...templateQid.split('/'),
    );
    const liveTemplatePath = path.join(
      courseRepo.courseLiveDir,
      'questions',
      ...templateQid.split('/'),
    );
    await fs.ensureDir(templatePath);
    await fs.writeJson(
      path.join(templatePath, 'info.json'),
      {
        uuid: '11111111-1111-4111-8111-111111111111',
        title: 'Test Template Question',
        topic: 'Test',
        tags: ['tbretl'],
        type: 'v3',
        shareSourcePublicly: true,
      },
      { spaces: 2 },
    );
    await fs.writeFile(
      path.join(templatePath, 'question.html'),
      '<pl-question-panel>Test Course Template</pl-question-panel>\n',
    );
    await fs.writeFile(
      path.join(templatePath, 'server.py'),
      'def grade(data):\n    data["score"] = 0.5\n',
    );
    await execa('git', ['add', '-A'], { cwd: courseRepo.courseOriginDir });
    await execa(
      'git',
      [
        '-c',
        'user.name=Test User',
        '-c',
        'user.email=test@example.com',
        'commit',
        '-m',
        'Add course template question',
      ],
      { cwd: courseRepo.courseOriginDir },
    );
    await execa('git', ['pull'], { cwd: courseRepo.courseLiveDir });

    const trpc = createTrpcClient();
    const draft = await trpc.questions.createDraft.mutate({
      startFrom: 'course',
      templateQid,
    });

    assert.match(draft.editorUrl, new RegExp(`/question/${draft.questionId}/draft$`));

    const { path: draftPath } = await assertDraftQuestion({
      questionId: draft.questionId,
      draftNumber: 3,
    });
    const questionInfo = await readInfoJson(draftPath);

    assert.equal(questionInfo.title, 'draft #3');
    assert.equal(questionInfo.topic, 'Test');
    assert.isUndefined(questionInfo.shareSourcePublicly);
    assert.equal(
      await fs.readFile(path.join(draftPath, 'server.py'), 'utf8'),
      await fs.readFile(path.join(liveTemplatePath, 'server.py'), 'utf8'),
    );
    assert.equal(
      await fs.readFile(path.join(draftPath, 'question.html'), 'utf8'),
      await fs.readFile(path.join(liveTemplatePath, 'question.html'), 'utf8'),
    );
  });

  test.sequential('rejects a non-existent template question', async () => {
    const trpc = createTrpcClient();

    await assertCreateDraftEditorJobFailed(
      trpc.questions.createDraft.mutate({
        startFrom: 'example',
        templateQid: 'template/non-existent-template',
      }),
    );
  });

  test.sequential('rejects missing template_qid values for template starts', async () => {
    const trpc = createTrpcClient();

    await assertCreateDraftBadRequest(
      trpc.questions.createDraft.mutate({ startFrom: 'example' }),
      'templateQid is required.',
    );
    await assertCreateDraftBadRequest(
      trpc.questions.createDraft.mutate({ startFrom: 'course' }),
      'templateQid is required.',
    );
  });

  test.sequential('rejects template_qid values for empty starts', async () => {
    const trpc = createTrpcClient();

    await assertCreateDraftBadRequest(
      trpc.questions.createDraft.mutate({
        startFrom: 'empty',
        templateQid: 'template/matrix-component-input/random-graph',
      }),
      'templateQid cannot be supplied for an empty question.',
    );
  });

  test.sequential('rejects template_qid values outside the root directory', async () => {
    const trpc = createTrpcClient();

    await assertCreateDraftEditorJobFailed(
      trpc.questions.createDraft.mutate({
        startFrom: 'example',
        templateQid: '../template/matrix-component-input/random-graph',
      }),
    );
  });
});
