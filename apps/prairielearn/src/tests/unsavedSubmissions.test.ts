import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { type IncomingMessage, request } from 'node:http';

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import {
  execute,
  loadSqlEquiv,
  queryOptionalRow,
  queryRow,
  queryScalar,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { withResolvers } from '@prairielearn/utils';
import { IdSchema } from '@prairielearn/zod';

import {
  deleteAllAssessmentInstancesForAssessment,
  makeAssessmentInstance,
} from '../lib/assessment.js';
import {
  getAssessmentTrpcUrl,
  getInstanceQuestionTrpcUrl,
  getInstanceQuestionUnsavedSubmissionDiscardUrl,
} from '../lib/client/url.js';
import { config } from '../lib/config.js';
import {
  type Assessment,
  SubmissionSchema,
  UnsavedSubmissionSchema,
  type User,
} from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import {
  deleteUnsavedSubmissions,
  selectUnsavedSubmissionGeneration,
  upsertUnsavedSubmission,
} from '../models/unsaved-submission.js';
import { lockVariant } from '../models/variant.js';
import * as questionServers from '../question-servers/index.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';
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
  let groupAssessment: Assessment;

  function createClient(authnUserId = user.id, scopedInstanceQuestionId = instanceQuestionId) {
    return createInstanceQuestionTrpcClient({
      csrfToken: generatePrefixCsrfToken(
        {
          url: getInstanceQuestionTrpcUrl({
            courseInstanceId,
            instanceQuestionId: scopedInstanceQuestionId,
          }),
          authn_user_id: authnUserId,
        },
        config.secretKey,
      ),
      courseInstanceId,
      instanceQuestionId: scopedInstanceQuestionId,
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

  async function seedRecoverableDraft() {
    return upsertUnsavedSubmission({
      variant_id: variantId,
      instance_question_id: instanceQuestionId,
      user_id: user.id,
      credit: 25,
      raw_submitted_answer: { c: '17' },
      uuid: randomUUID(),
      generation: await selectGeneration(),
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
    groupAssessment = await selectAssessmentByTid({
      course_instance_id: courseInstanceId,
      tid: 'exam14-groupWork',
    });
    await createAssessmentTrpcClient({
      csrfToken: generatePrefixCsrfToken(
        {
          url: getAssessmentTrpcUrl({ courseInstanceId, assessmentId: groupAssessment.id }),
          authn_user_id: user.id,
        },
        config.secretKey,
      ),
      courseInstanceId,
      assessmentId: groupAssessment.id,
      urlBase: siteUrl,
    }).assessmentGroups.addGroup.mutate({
      groupName: 'DraftRecoveryGroup',
      uids: `${user.uid},${otherUser.uid}`,
    });
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

  test('prevents another enrolled user from modifying the draft', async () => {
    const uuid = randomUUID();
    await withConfig(
      { features: { 'unsaved-submissions-collection': true, 'unsaved-submissions-ui': true } },
      async () => {
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
          await expect(
            createClient(otherUser.id).unsavedSubmissions.restore.mutate({ variant_id: variantId }),
          ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
          await expect(
            createClient(otherUser.id).unsavedSubmissions.dismiss.mutate(),
          ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        });
      },
    );
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

  test('gates recovery separately and restores through normal saving with current credit', async () => {
    await seedRecoverableDraft();
    await withConfig(
      { features: { 'unsaved-submissions-collection': true, 'unsaved-submissions-ui': false } },
      async () => {
        const page = await helperClient.fetchCheerio(instanceQuestionUrl);
        expect(page.$('#unsaved-submission-recovery')).toHaveLength(0);
        await expect(
          createClient().unsavedSubmissions.restore.mutate({ variant_id: variantId }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        await expect(createClient().unsavedSubmissions.dismiss.mutate()).rejects.toMatchObject({
          data: { code: 'FORBIDDEN' },
        });
        expect(await selectDraft()).not.toBeNull();
      },
    );

    await withConfig(
      { features: { 'unsaved-submissions-collection': false, 'unsaved-submissions-ui': true } },
      async () => {
        const page = await helperClient.fetchCheerio(instanceQuestionUrl);
        expect(page.$('#unsaved-submission-recovery')).toHaveLength(1);
        await createClient().unsavedSubmissions.restore.mutate({ variant_id: variantId });
      },
    );

    expect(await selectDraft()).toBeNull();
    const submission = await queryRow(
      sql.select_latest_submission,
      { variant_id: variantId },
      SubmissionSchema,
    );
    expect(submission).toMatchObject({
      variant_id: variantId,
      auth_user_id: user.id,
      credit: 100,
      raw_submitted_answer: { c: '17' },
      submitted_answer: { c: 17 },
      graded_at: null,
      grading_requested_at: null,
    });
  });

  test('retains the draft and course issue after a fatal restore parse so the student can retry', async () => {
    await seedRecoverableDraft();
    const draft = await selectDraft();
    const questionModule = questionServers.getModule('Freeform');
    const originalParse = questionModule.parse;
    await withConfig({ features: { 'unsaved-submissions-ui': true } }, async () => {
      const parse = vi.spyOn(questionModule, 'parse').mockImplementationOnce(async (...args) => {
        const result = await originalParse(...args);
        result.courseIssues.push(
          Object.assign(new Error('Fatal recovery parsing issue'), { fatal: true }),
        );
        return result;
      });
      try {
        await expect(
          createClient().unsavedSubmissions.restore.mutate({ variant_id: variantId }),
        ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
      } finally {
        parse.mockRestore();
      }
      expect(await selectDraft()).toEqual(draft);
      expect(
        await queryRow(sql.select_latest_submission, { variant_id: variantId }, SubmissionSchema),
      ).toMatchObject({ broken: true, raw_submitted_answer: { c: '17' } });
      expect(await queryScalar(sql.count_parse_issues, { variant_id: variantId }, z.number())).toBe(
        1,
      );
      expect(
        (await helperClient.fetchCheerio(instanceQuestionUrl)).$('#unsaved-submission-recovery'),
      ).toHaveLength(1);
      await createClient().unsavedSubmissions.restore.mutate({ variant_id: variantId });
      expect(await selectDraft()).toBeNull();
      expect(
        await queryRow(sql.select_latest_submission, { variant_id: variantId }, SubmissionSchema),
      ).toMatchObject({ broken: false, submitted_answer: { c: 17 } });
    });
  });

  test.each([false, true])(
    'clears group drafts and invalidates delayed captures on Save (teammate draft: %s)',
    async (hasTeammateDraft) => {
      await deleteAllAssessmentInstancesForAssessment(groupAssessment.id, user.id);
      const assessmentInstanceId = await makeAssessmentInstance({
        assessment: groupAssessment,
        user_id: user.id,
        authn_user_id: user.id,
        mode: 'Public',
        time_limit_min: null,
        date: new Date(),
        client_fingerprint_id: null,
      });
      const groupInstanceQuestionId = await queryScalar(
        sql.select_group_instance_question,
        { assessment_instance_id: assessmentInstanceId },
        IdSchema,
      );
      const groupQuestionUrl = `${siteUrl}/pl/course_instance/${courseInstanceId}/instance_question/${groupInstanceQuestionId}`;
      const questionPage = await helperClient.fetchCheerio(groupQuestionUrl);
      const groupVariantId = questionPage.$('input[name="__variant_id"]').val() as string;
      const draftKey = {
        instance_question_id: groupInstanceQuestionId,
        user_id: otherUser.id,
        variant_id: groupVariantId,
      };
      const oldGeneration = await selectUnsavedSubmissionGeneration(draftKey);
      if (hasTeammateDraft) {
        await upsertUnsavedSubmission({
          ...draftKey,
          credit: 100,
          raw_submitted_answer: { c: '17' },
          uuid: randomUUID(),
          generation: oldGeneration,
        });
      }
      await withConfig(
        { features: { 'unsaved-submissions-collection': true, 'unsaved-submissions-ui': true } },
        async () => {
          expect(
            (await helperClient.saveOrGrade(groupQuestionUrl, { c: '23' }, 'save')).status,
          ).toBe(200);
          await withUser(otherUser, async () => {
            const client = createClient(otherUser.id, groupInstanceQuestionId);
            const page = await helperClient.fetchCheerio(groupQuestionUrl);
            expect(page.$('#unsaved-submission-recovery')).toHaveLength(0);
            await expect(
              client.unsavedSubmissions.restore.mutate({ variant_id: groupVariantId }),
            ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
            const input = {
              uuid: randomUUID(),
              generation: oldGeneration,
              formData: { __variant_id: groupVariantId, c: 'stale work' },
            };
            expect(await client.unsavedSubmissions.upsert.mutate(input)).toEqual({ saved: false });
            expect(
              await queryRow(
                sql.select_latest_submission,
                { variant_id: groupVariantId },
                SubmissionSchema,
              ),
            ).toMatchObject({ raw_submitted_answer: { c: '23' } });
            expect(
              await client.unsavedSubmissions.upsert.mutate({
                ...input,
                uuid: randomUUID(),
                generation: await client.unsavedSubmissions.generation.query(),
                formData: { __variant_id: groupVariantId, c: 'new work' },
              }),
            ).toEqual({ saved: true });
          });
        },
      );
    },
  );

  test('rejects mismatched recovery and supports dismissal and real saves with collection disabled', async () => {
    await seedRecoverableDraft();
    await withConfig(
      { features: { 'unsaved-submissions-collection': false, 'unsaved-submissions-ui': true } },
      async () => {
        await expect(
          createClient().unsavedSubmissions.restore.mutate({ variant_id: '999999999' }),
        ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
        expect(await selectDraft()).not.toBeNull();
        await createClient().unsavedSubmissions.dismiss.mutate();
        expect(await selectDraft()).toBeNull();

        await seedRecoverableDraft();
        const response = await helperClient.saveOrGrade(instanceQuestionUrl, { c: '18' }, 'save');
        expect(response.status).toBe(200);
        expect(await selectDraft()).toBeNull();
      },
    );
  });

  test('does not restore a draft cleared by an earlier queued save', async () => {
    await withConfig(
      { features: { 'unsaved-submissions-collection': true, 'unsaved-submissions-ui': true } },
      async () => {
        await seedRecoverableDraft();
        const page = await helperClient.fetchCheerio(instanceQuestionUrl);
        const csrfToken = page.$('form.question-form input[name="__csrf_token"]').attr('value')!;
        // Keep the session so fingerprint changes do not introduce an earlier assessment lock.
        const cookie = page.headers
          .getSetCookie()
          .map((value) => value.split(';')[0])
          .join('; ');
        const locked = withResolvers<undefined>();
        const release = withResolvers<undefined>();
        const holder = runInTransactionAsync(async () => {
          await lockVariant({ variant_id: variantId });
          locked.resolve(undefined);
          await release.promise;
        });
        const pending: Promise<unknown>[] = [holder];
        let saved!: Promise<unknown>;
        let restored!: Promise<unknown>;
        const waiting = (queryPattern: string) =>
          queryScalar(
            sql.count_waiting_assessment_locks,
            { query_pattern: queryPattern },
            z.number(),
          );

        try {
          await Promise.race([locked.promise, holder]);
          saved = fetch(instanceQuestionUrl, {
            method: 'POST',
            headers: { cookie },
            body: new URLSearchParams({
              __variant_id: variantId,
              __action: 'save',
              __csrf_token: csrfToken,
              c: '23',
            }),
          }).then(
            (response) => ({ response }),
            (error: unknown) => ({ error }),
          );
          pending.push(saved);
          await expect
            .poll(() => waiting('%lock_assessment_instance AS%'), { timeout: 10_000 })
            .toBe(1);

          restored = createClient()
            .unsavedSubmissions.restore.mutate({ variant_id: variantId })
            .then(
              () => ({ restored: true }),
              (error: unknown) => ({ error }),
            );
          pending.push(restored);
          await expect.poll(() => waiting('%assessment_instances%'), { timeout: 10_000 }).toBe(2);
        } finally {
          release.resolve(undefined);
          await Promise.allSettled(pending);
        }

        expect(await saved).toMatchObject({ response: { status: 200 } });
        const submission = await queryRow(
          sql.select_latest_submission,
          { variant_id: variantId },
          SubmissionSchema,
        );
        expect(submission.raw_submitted_answer).toEqual({ c: '23' });
        expect(await restored).toMatchObject({ error: { data: { code: 'NOT_FOUND' } } });
        expect(await selectDraft()).toBeNull();
      },
    );
  });

  test('clears drafts on real saves and retains work after closure', async () => {
    await withConfig(
      { features: { 'unsaved-submissions-collection': true, 'unsaved-submissions-ui': true } },
      async () => {
        await capture(randomUUID());
        const response = await helperClient.saveOrGrade(instanceQuestionUrl, { c: '5' }, 'save');
        expect(response.status).toBe(200);
        expect(await selectDraft()).toBeNull();

        const uuid = randomUUID();
        await capture(uuid);
        await execute(sql.close_assessment_instance, { instance_question_id: instanceQuestionId });
        await expect(
          createClient().unsavedSubmissions.restore.mutate({ variant_id: variantId }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
        await expect(createClient().unsavedSubmissions.dismiss.mutate()).rejects.toMatchObject({
          data: { code: 'FORBIDDEN' },
        });
        expect((await discard(uuid, createDiscardCsrfToken())).status).toBe(204);
        expect(await selectDraft()).toMatchObject({ uuid });
      },
    );
  });
});
