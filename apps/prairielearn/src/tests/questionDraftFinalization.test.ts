import * as path from 'node:path';

import { TRPCClientError } from '@trpc/client';
import * as cheerio from 'cheerio';
import { execa } from 'execa';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { getCourseTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { features } from '../lib/features/index.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import {
  selectOptionalQuestionByQid,
  selectQuestionById,
  selectQuestionByQid,
} from '../models/question.js';
import { selectTagsByQuestionId } from '../models/tags.js';
import { selectTopicsByCourseId } from '../models/topics.js';
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
const QuestionsTableRowSchema = z.object({
  id: IdSchema,
  qid: z.string(),
  draft: z.boolean(),
  status: z.enum(['Draft', 'Finalized']),
});

let courseRepo: CourseRepoFixture;
const originalIsEnterprise = config.isEnterprise;

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

async function assertBadRequest(promise: Promise<unknown>, message: string) {
  try {
    await promise;
    assert.fail('Expected mutation to throw');
  } catch (err: unknown) {
    assert.instanceOf(err, TRPCClientError);
    assert.equal((err as TRPCClientError<CourseRouter>).data?.code, 'BAD_REQUEST');
    assert.include((err as Error).message, message);
  }
}

async function selectDraftQuestionMetadata(questionId: string) {
  return await sqldb.queryOptionalRow(
    sql.select_draft_question_metadata,
    { question_id: questionId },
    DraftQuestionMetadataSchema,
  );
}

async function assertRedirects(fromUrl: string, toUrl: string) {
  const response = await fetch(fromUrl, {
    redirect: 'manual',
    headers: { cookie: 'pl_test_user=test_instructor' },
  });

  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), toUrl);
}

async function getQuestionsTableData() {
  const response = await fetch(`${siteUrl}/pl/course/1/course_admin/questions`, {
    headers: { cookie: 'pl_test_user=test_instructor' },
  });
  assert.equal(response.status, 200);

  const $ = cheerio.load(await response.text());
  assert.include($('#questionsTable thead').text(), 'Status');

  return z.array(QuestionsTableRowSchema).parse($('#questionsTable').data('data'));
}

describe('Question draft finalization', { timeout: 20_000 }, () => {
  beforeAll(async () => {
    config.isEnterprise = true;
    courseRepo = await createCourseRepoFixture(courseTemplateDir);
    await helperServer.before(courseRepo.courseLiveDir)();
    await updateCourseRepository({ courseId: '1', repository: courseRepo.courseOriginDir });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'instructor@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    await features.enable('ai-question-generation');
  });

  afterAll(async () => {
    await helperServer.after();
    config.isEnterprise = originalIsEnterprise;
  });

  test.sequential('rejects finalizing a non-draft question', async () => {
    const trpc = createTrpcClient();
    const question = await selectQuestionByQid({ course_id: '1', qid: 'test/question' });

    await assertBadRequest(
      trpc.questions.finalizeDraft.mutate({
        questionId: question.id,
        qid: 'finalized-question',
        title: 'Finalized question',
      }),
      'Question must be an active draft question in this course.',
    );
  });

  test.sequential('rejects invalid finalized QIDs for a draft question', async () => {
    const trpc = createTrpcClient();
    const draft = await trpc.questions.createDraft.mutate({ startFrom: 'empty' });
    const draftQuestion = await selectQuestionById(draft.questionId);

    await assertBadRequest(
      trpc.questions.finalizeDraft.mutate({
        questionId: draft.questionId,
        qid: 'invalid qid',
        title: 'Finalized question',
      }),
      'Invalid QID:',
    );

    await assertBadRequest(
      trpc.questions.finalizeDraft.mutate({
        questionId: draft.questionId,
        qid: '__drafts__/finalized-question',
        title: 'Finalized question',
      }),
      'Finalized question QIDs cannot be in the draft namespace.',
    );

    const tableData = await getQuestionsTableData();
    assert.deepInclude(tableData, {
      id: draft.questionId,
      qid: draftQuestion.qid,
      draft: true,
      status: 'Draft',
    });
    assert.isTrue(tableData.some((row) => row.draft === false && row.status === 'Finalized'));
  });

  test.sequential('finalizes a draft question', async () => {
    const trpc = createTrpcClient();
    const draft = await trpc.questions.createDraft.mutate({ startFrom: 'empty' });
    const draftQuestion = await selectQuestionById(draft.questionId);
    const draftQid = draftQuestion.qid;
    if (draftQid == null) throw new Error('Expected draft question to have a QID');

    assert.isNotNull(await selectDraftQuestionMetadata(draft.questionId));
    await assertRedirects(
      `${siteUrl}/pl/course/1/ai_generate_editor/${draft.questionId}`,
      `/pl/course/1/question/${draft.questionId}/draft`,
    );
    await assertRedirects(
      `${siteUrl}/pl/course/1/ai_generate_editor/${draft.questionId}?variant_id=123`,
      `/pl/course/1/question/${draft.questionId}/draft?variant_id=123`,
    );
    await assertRedirects(
      `${siteUrl}/pl/course/1/question/${draft.questionId}/draft`,
      `/pl/course/1/ai_generate_editor/${draft.questionId}/editor`,
    );
    await assertRedirects(
      `${siteUrl}/pl/course/1/question/${draft.questionId}/draft?variant_id=123`,
      `/pl/course/1/ai_generate_editor/${draft.questionId}/editor?variant_id=123`,
    );
    for (const suffix of ['', '/preview', '/settings', '/statistics']) {
      await assertRedirects(
        `${siteUrl}/pl/course/1/question/${draft.questionId}${suffix}`,
        `/pl/course/1/question/${draft.questionId}/draft`,
      );
    }

    const finalQid = 'finalized-question-success';
    const finalTitle = 'Finalized question success';
    const result = await trpc.questions.finalizeDraft.mutate({
      questionId: draft.questionId,
      qid: finalQid,
      title: finalTitle,
    });

    assert.equal(result.questionId, draft.questionId);
    assert.match(result.previewUrl, new RegExp(`/question/${draft.questionId}/preview$`));
    await assertRedirects(
      `${siteUrl}/pl/course/1/ai_generate_editor/${draft.questionId}`,
      `/pl/course/1/question/${draft.questionId}/preview`,
    );

    const finalizedQuestion = await selectQuestionByQid({ course_id: '1', qid: finalQid });
    assert.equal(finalizedQuestion.id, draft.questionId);
    assert.isFalse(finalizedQuestion.draft);
    assert.equal(finalizedQuestion.title, finalTitle);

    assert.isNull(await selectOptionalQuestionByQid({ course_id: '1', qid: draftQid }));
    assert.isNull(await selectDraftQuestionMetadata(draft.questionId));
  });

  test.sequential('preserves valid template topic and tags when creating a draft', async () => {
    const templateQid = 'template/preserved-topic-tag';
    const templatePath = path.join(
      courseRepo.courseOriginDir,
      'questions',
      ...templateQid.split('/'),
    );
    await fs.copy(
      path.join(courseRepo.courseOriginDir, 'questions', 'test', 'question'),
      templatePath,
    );
    await fs.writeJson(
      path.join(templatePath, 'info.json'),
      {
        uuid: '11111111-1111-4111-8111-111111111111',
        title: 'Template with topic and tag',
        topic: 'Test',
        tags: ['tbretl'],
        type: 'v3',
      },
      { spaces: 2 },
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
        'Add test template question',
      ],
      { cwd: courseRepo.courseOriginDir },
    );
    await execa('git', ['fetch', 'origin', 'master'], { cwd: courseRepo.courseLiveDir });

    const trpc = createTrpcClient();
    const draft = await trpc.questions.createDraft.mutate({
      startFrom: 'course',
      templateQid,
    });
    const draftQuestion = await selectQuestionById(draft.questionId);
    const topics = await selectTopicsByCourseId('1');
    const tags = await selectTagsByQuestionId(draft.questionId);

    assert.equal(draftQuestion.topic_id, topics.find((topic) => topic.name === 'Test')?.id);
    assert.sameMembers(
      tags.map((tag) => tag.name),
      ['tbretl'],
    );
    assert.isFalse(draftQuestion.share_source_publicly);
    assert.isFalse(draftQuestion.share_publicly);
    assert.isNotNull(await selectDraftQuestionMetadata(draft.questionId));
  });
});
