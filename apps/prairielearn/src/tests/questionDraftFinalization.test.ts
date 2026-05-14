import * as path from 'node:path';

import { TRPCClientError } from '@trpc/client';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { getCourseTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import {
  selectOptionalQuestionByQid,
  selectQuestionById,
  selectQuestionByQid,
} from '../models/question.js';
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

describe('Question draft finalization', { timeout: 20_000 }, () => {
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
  });

  test.sequential('finalizes a draft question', async () => {
    const trpc = createTrpcClient();
    const draft = await trpc.questions.createDraft.mutate({ startFrom: 'empty' });
    const draftQuestion = await selectQuestionById(draft.questionId);
    const draftQid = draftQuestion.qid;
    if (draftQid == null) throw new Error('Expected draft question to have a QID');

    assert.isNotNull(await selectDraftQuestionMetadata(draft.questionId));

    const finalQid = 'finalized-question-success';
    const finalTitle = 'Finalized question success';
    const result = await trpc.questions.finalizeDraft.mutate({
      questionId: draft.questionId,
      qid: finalQid,
      title: finalTitle,
    });

    assert.equal(result.questionId, draft.questionId);
    assert.match(result.previewUrl, new RegExp(`/question/${draft.questionId}/preview$`));

    const finalizedQuestion = await selectQuestionByQid({ course_id: '1', qid: finalQid });
    assert.equal(finalizedQuestion.id, draft.questionId);
    assert.isFalse(finalizedQuestion.draft);
    assert.equal(finalizedQuestion.title, finalTitle);

    assert.isNull(await selectOptionalQuestionByQid({ course_id: '1', qid: draftQid }));
    assert.isNull(await selectDraftQuestionMetadata(draft.questionId));
  });
});
