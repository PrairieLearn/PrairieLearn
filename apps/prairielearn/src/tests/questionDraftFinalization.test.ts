import * as path from 'node:path';

import { TRPCClientError } from '@trpc/client';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { getCourseTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import { selectQuestionByQid } from '../models/question.js';
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
});
