import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { type IncomingMessage, request } from 'node:http';

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
import {
  deleteUnsavedSubmissions,
  selectUnsavedSubmissionGeneration,
} from '../models/unsaved-submission.js';
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

  function captureInput(uuid: string, generation: number) {
    return {
      uuid,
      generation,
      formData: {
        __variant_id: variantId,
        c: 'unfinished',
        repeated: ['one', 'two'],
      },
    };
  }

  function selectGeneration() {
    return selectUnsavedSubmissionGeneration({
      instance_question_id: instanceQuestionId,
      user_id: user.id,
    });
  }

  async function capture(uuid: string, generation?: number) {
    return createClient().unsavedSubmissions.upsert.mutate(
      captureInput(uuid, generation ?? (await selectGeneration())),
    );
  }

  async function delayCapture(uuid: string, generation: number) {
    const body = JSON.stringify({ json: captureInput(uuid, generation) });
    const path = `${getInstanceQuestionTrpcUrl({ courseInstanceId, instanceQuestionId })}/unsavedSubmissions.upsert`;
    const pending = request(`${siteUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-TRPC': 'true',
        'X-CSRF-Token': generatePrefixCsrfToken(
          { url: path, authn_user_id: user.id },
          config.secretKey,
        ),
        Expect: '100-continue',
      },
    });
    const response = new Promise<IncomingMessage>((resolve, reject) => {
      pending.once('response', resolve);
      pending.once('error', reject);
    });
    pending.flushHeaders();
    await once(pending, 'continue');
    // Keep the final byte back so parsing cannot finish until the competing action completes.
    pending.write(body.slice(0, -1));

    return {
      finish: async () => {
        pending.end(body.slice(-1));
        const received = await response;
        let text = '';
        for await (const chunk of received) text += chunk.toString();
        return { status: received.statusCode, body: JSON.parse(text) };
      },
      cancel: async () => {
        pending.destroy();
        await response.catch(() => undefined);
      },
    };
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

  async function discard(uuid: string, csrfToken?: string, generation?: number) {
    const path = getInstanceQuestionUnsavedSubmissionDiscardUrl({
      courseInstanceId,
      instanceQuestionId,
    });
    return fetch(`${siteUrl}${path}`, {
      method: 'POST',
      body: new URLSearchParams({
        uuid,
        generation: String(generation ?? (await selectGeneration())),
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
      await expect(createClient().unsavedSubmissions.generation.query()).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      });
    });
    expect(await selectDraft()).toBeNull();

    await withConfig({ features: { 'unsaved-submissions-collection': true } }, async () => {
      const page = await helperClient.fetchCheerio(instanceQuestionUrl);
      expect(page.$('script[src*="unsavedSubmissionsClient"]')).toHaveLength(1);
      const generation = await createClient().unsavedSubmissions.generation.query();
      expect(await capture(uuid, generation)).toEqual({ saved: true });
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
    const replacementUuid = randomUUID();
    const csrfToken = createDiscardCsrfToken();
    await withConfig({ features: { 'unsaved-submissions-collection': true } }, async () => {
      await capture(oldUuid);
      const delayed = await delayCapture(oldUuid, await selectGeneration());
      try {
        await capture(currentUuid);
        expect((await discard(currentUuid)).status).toBe(403);
        expect((await discard(oldUuid, csrfToken)).status).toBe(204);
        expect(await selectDraft()).toMatchObject({ uuid: currentUuid });
        expect(await delayed.finish()).toMatchObject({
          status: 200,
          body: { result: { data: { json: { saved: false } } } },
        });
        expect(await selectDraft()).toMatchObject({ uuid: currentUuid });
        expect((await discard(currentUuid, csrfToken)).status).toBe(204);
        expect(await selectDraft()).toBeNull();
        expect(await capture(replacementUuid)).toEqual({ saved: true });
      } finally {
        await delayed.cancel();
      }
    });

    await withConfig({ features: { 'unsaved-submissions-collection': false } }, async () => {
      expect((await discard(replacementUuid, csrfToken)).status).toBe(403);
      expect(await selectDraft()).toMatchObject({ uuid: replacementUuid });
      const response = await helperClient.saveOrGrade(instanceQuestionUrl, { c: '5' }, 'save');
      expect(response.status).toBe(200);
      expect(await selectDraft()).toMatchObject({ uuid: replacementUuid });
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
            generation: await selectGeneration(),
            formData: { __variant_id: variantId, c: 'other user' },
          }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        expect((await discard(uuid, createDiscardCsrfToken(otherUser.id))).status).toBe(403);
      });
    });
    expect(await selectDraft()).toMatchObject({ uuid, user_id: user.id });
  });

  test.each(['save', 'discard'] as const)(
    'rejects an in-flight capture whose body arrives after %s',
    async (action) => {
      await withConfig({ features: { 'unsaved-submissions-collection': true } }, async () => {
        const uuid = randomUUID();
        const generation = await createClient().unsavedSubmissions.generation.query();
        const delayed = await delayCapture(uuid, generation);
        try {
          const invalidated =
            action === 'save'
              ? await helperClient.saveOrGrade(instanceQuestionUrl, { c: '5' }, 'save')
              : await discard(uuid, createDiscardCsrfToken(), generation);
          expect(invalidated.status).toBe(action === 'save' ? 200 : 204);

          expect(await delayed.finish()).toMatchObject({
            status: 200,
            body: { result: { data: { json: { saved: false } } } },
          });
          expect(await selectDraft()).toBeNull();
          const freshGeneration = await createClient().unsavedSubmissions.generation.query();
          expect(await capture(randomUUID(), freshGeneration)).toEqual({ saved: true });
        } finally {
          await delayed.cancel();
        }
      });
    },
  );

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
