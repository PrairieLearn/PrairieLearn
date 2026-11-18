import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { execute, loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import {
  getInstanceQuestionTrpcUrl,
  getInstanceQuestionUnsavedSubmissionDiscardUrl,
} from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { UnsavedSubmissionSchema, type User } from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import { deleteUnsavedSubmissions } from '../models/unsaved-submission.js';
import { createInstanceQuestionTrpcClient } from '../trpc/instanceQuestion/client.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';
import { getConfiguredUser, withUser } from './utils/auth.js';
import { withConfig } from './utils/config.js';

const sql = loadSqlEquiv(import.meta.url);
const siteUrl = `http://localhost:${config.serverPort}`;
const courseInstanceId = '1';

describe('Unsaved submission collection', { concurrent: false }, () => {
  let user: User;
  let otherUser: User;
  let instanceQuestionId: string;
  let instanceQuestionUrl: string;
  let variantId: string;

  function createClient(authnUserId = user.id) {
    return createInstanceQuestionTrpcClient({
      csrfToken: generatePrefixCsrfToken(
        {
          url: getInstanceQuestionTrpcUrl({ courseInstanceId, instanceQuestionId }),
          authn_user_id: authnUserId,
        },
        config.secretKey,
      ),
      courseInstanceId,
      instanceQuestionId,
      urlBase: siteUrl,
    });
  }

  function selectDraft() {
    return queryOptionalRow(
      sql.select_unsaved_submission,
      { instance_question_id: instanceQuestionId, user_id: user.id },
      UnsavedSubmissionSchema,
    );
  }

  function capture(uuid: string) {
    return createClient().unsavedSubmissions.upsert.mutate({
      uuid,
      formData: {
        __variant_id: variantId,
        c: 'unfinished',
        repeated: ['one', 'two'],
      },
    });
  }

  function createDiscardCsrfToken(authnUserId = user.id) {
    return generatePrefixCsrfToken(
      {
        url: `/pl/course_instance/${courseInstanceId}/instance_question/${instanceQuestionId}`,
        authn_user_id: authnUserId,
      },
      config.secretKey,
    );
  }

  function discard(uuid: string, csrfToken?: string) {
    const path = getInstanceQuestionUnsavedSubmissionDiscardUrl({
      courseInstanceId,
      instanceQuestionId,
    });
    return fetch(`${siteUrl}${path}`, {
      method: 'POST',
      body: new URLSearchParams({
        uuid,
        ...(csrfToken ? { __csrf_token: csrfToken } : {}),
      }),
    });
  }

  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  beforeAll(async () => {
    user = await getConfiguredUser();
    [otherUser] = await generateAndEnrollUsers({ count: 1, course_instance_id: courseInstanceId });
    const assessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: 'hw1-automaticTestSuite',
    });
    const overview = await helperClient.fetchCheerio(
      `${siteUrl}/pl/course_instance/${courseInstanceId}/assessment/${assessment.id}/`,
    );
    instanceQuestionUrl = new URL(
      overview.$('a[href*="/instance_question/"]').first().attr('href')!,
      siteUrl,
    ).href;
    instanceQuestionId = String(helperClient.parseInstanceQuestionId(instanceQuestionUrl));
    const question = await helperClient.fetchCheerio(instanceQuestionUrl);
    variantId = question.$('input[name="__variant_id"]').val() as string;
  });

  beforeEach(async () => {
    await deleteUnsavedSubmissions({
      instance_question_id: instanceQuestionId,
      user_id: user.id,
    });
  });

  test('requires collection to be enabled and stores unparsed answers with server context', async () => {
    const uuid = randomUUID();
    await withConfig({ features: { 'unsaved-submissions-collection': false } }, async () => {
      const page = await helperClient.fetchCheerio(instanceQuestionUrl);
      expect(page.$('script[src*="unsavedSubmissionsClient"]')).toHaveLength(0);
      await expect(capture(uuid)).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    });
    expect(await selectDraft()).toBeNull();

    await withConfig({ features: { 'unsaved-submissions-collection': true } }, async () => {
      const page = await helperClient.fetchCheerio(instanceQuestionUrl);
      expect(page.$('script[src*="unsavedSubmissionsClient"]')).toHaveLength(1);
      await capture(uuid);
    });
    expect(await selectDraft()).toMatchObject({
      variant_id: variantId,
      user_id: user.id,
      credit: 100,
      raw_submitted_answer: { c: 'unfinished', repeated: ['one', 'two'] },
      uuid,
    });
  });

  test('guards discard requests and preserves drafts when collection is disabled', async () => {
    const oldUuid = randomUUID();
    const currentUuid = randomUUID();
    const csrfToken = createDiscardCsrfToken();
    await withConfig({ features: { 'unsaved-submissions-collection': true } }, async () => {
      await capture(oldUuid);
      await capture(currentUuid);
      expect((await discard(currentUuid)).status).toBe(403);
      expect((await discard(oldUuid, csrfToken)).status).toBe(204);
      expect(await selectDraft()).toMatchObject({ uuid: currentUuid });
      expect((await discard(currentUuid, csrfToken)).status).toBe(204);
      expect(await selectDraft()).toBeNull();
      await capture(currentUuid);
    });

    await withConfig({ features: { 'unsaved-submissions-collection': false } }, async () => {
      expect((await discard(currentUuid, csrfToken)).status).toBe(403);
      expect(await selectDraft()).toMatchObject({ uuid: currentUuid });
      const response = await helperClient.saveOrGrade(instanceQuestionUrl, { c: '5' }, 'save');
      expect(response.status).toBe(200);
      expect(await selectDraft()).toMatchObject({ uuid: currentUuid });
    });
  });

  test('prevents another enrolled user from writing or discarding the draft', async () => {
    const uuid = randomUUID();
    await withConfig({ features: { 'unsaved-submissions-collection': true } }, async () => {
      await capture(uuid);
      await withUser(otherUser, async () => {
        await expect(
          createClient(otherUser.id).unsavedSubmissions.upsert.mutate({
            uuid: randomUUID(),
            formData: { __variant_id: variantId, c: 'other user' },
          }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        expect((await discard(uuid, createDiscardCsrfToken(otherUser.id))).status).toBe(403);
      });
    });
    expect(await selectDraft()).toMatchObject({ uuid, user_id: user.id });
  });

  test('clears drafts on real saves and retains work after closure', async () => {
    await withConfig({ features: { 'unsaved-submissions-collection': true } }, async () => {
      await capture(randomUUID());
      const response = await helperClient.saveOrGrade(instanceQuestionUrl, { c: '5' }, 'save');
      expect(response.status).toBe(200);
      expect(await selectDraft()).toBeNull();

      const uuid = randomUUID();
      await capture(uuid);
      await execute(sql.close_assessment_instance, { instance_question_id: instanceQuestionId });
      expect((await discard(uuid, createDiscardCsrfToken())).status).toBe(204);
      expect(await selectDraft()).toMatchObject({ uuid });
    });
  });
});
