import { once } from 'node:events';
import { type IncomingMessage, request } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

import { createTRPCClient, httpLink } from '@trpc/client';
import superjson from 'superjson';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryScalar } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { makeAssessmentInstance, selectAssessmentInstanceLog } from '../lib/assessment.js';
import { getAssessmentInstanceTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { SubmissionSchema, type User } from '../lib/db-types.js';
import { selectAssessmentInstanceById } from '../models/assessment-instance.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import type { AssessmentInstanceRouter } from '../trpc/assessmentInstance/trpc.js';

import * as helperClient from './helperClient.js';
import { exam1AutomaticTestSuite, withPTReservation } from './helperExam.js';
import * as helperServer from './helperServer.js';
import { withUser } from './utils/auth.js';
import { withConfig } from './utils/config.js';

const sql = loadSqlEquiv(import.meta.url);
const siteUrl = `http://localhost:${config.serverPort}`;
const courseInstanceId = '1';
const start = new Date('2026-04-05T00:00:00Z');
const deadline = new Date(start.getTime() + 60_000);
const at = (offset: number) => new Date(deadline.getTime() + offset);

function cookie(date: Date, mode: 'Public' | 'Exam') {
  return `pl_test_date=${date.toISOString()}; pl_test_mode=${mode}`;
}

async function createFixture(user: User, prairieTest = false) {
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstanceId,
    tid: prairieTest ? 'exam1-automaticTestSuite' : 'exam21-afterCompleteTimeLimit',
  });
  const mode: 'Exam' | 'Public' = prairieTest ? 'Exam' : 'Public';
  const assessmentInstanceId = await makeAssessmentInstance({
    assessment,
    user_id: user.id,
    authn_user_id: user.id,
    mode,
    time_limit_min: prairieTest ? null : 1,
    date: start,
    client_fingerprint_id: null,
  });
  const instanceQuestionId = await queryScalar(
    sql.select_instance_question,
    { assessment_instance_id: assessmentInstanceId },
    IdSchema,
  );
  const questionUrl = `${siteUrl}/pl/course_instance/${courseInstanceId}/instance_question/${instanceQuestionId}/`;
  const page = await helperClient.fetchCheerio(questionUrl, {
    headers: { cookie: cookie(start, mode) },
  });
  expect(page.status).toBe(200);
  return {
    user,
    mode,
    assessmentInstanceId,
    questionUrl,
    variantId: helperClient.extractAndSaveVariantId({}, page.$, '.question-form'),
    questionCsrfToken: helperClient.getCSRFToken(page.$),
  };
}

type Fixture = Awaited<ReturnType<typeof createFixture>>;

function client(fixture: Fixture, date: Date, mode = fixture.mode, user = fixture.user) {
  const url = getAssessmentInstanceTrpcUrl({
    courseInstanceId,
    assessmentInstanceId: fixture.assessmentInstanceId,
  });
  return createTRPCClient<AssessmentInstanceRouter>({
    links: [
      httpLink({
        url: `${siteUrl}${url}`,
        transformer: superjson,
        headers: {
          'X-TRPC': 'true',
          'X-CSRF-Token': generatePrefixCsrfToken(
            { url, authn_user_id: user.id },
            config.secretKey,
          ),
          Cookie: cookie(date, mode),
        },
      }),
    ],
  }).examGrace;
}

async function withExam(callback: (fixture: Fixture) => Promise<void>) {
  const [user] = await generateAndEnrollUsers({ count: 1, course_instance_id: courseInstanceId });
  await withConfig({ features: { 'exam-grace-period': true } }, () =>
    withUser(user, async () => callback(await createFixture(user))),
  );
}

function latestSubmission(fixture: Fixture) {
  return queryRow(
    sql.select_latest_submission,
    { variant_id: fixture.variantId },
    SubmissionSchema,
  );
}

function finishViaForm(fixture: Fixture, date: Date, action: 'finish' | 'timeLimitFinish') {
  const path = `/pl/course_instance/${courseInstanceId}/assessment_instance/${fixture.assessmentInstanceId}`;
  return fetch(`${siteUrl}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Cookie: cookie(date, fixture.mode) },
    body: new URLSearchParams({
      __action: action,
      __csrf_token: generatePrefixCsrfToken(
        { url: path, authn_user_id: fixture.user.id },
        config.secretKey,
      ),
    }),
  });
}

async function delayMutation(
  fixture: Fixture,
  procedure: 'beginSave' | 'save',
  input: unknown,
  date: Date,
) {
  const path = `${getAssessmentInstanceTrpcUrl({ courseInstanceId, assessmentInstanceId: fixture.assessmentInstanceId })}/examGrace.${procedure}`;
  const body = JSON.stringify({ json: input });
  const pending = request(`${siteUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'X-TRPC': 'true',
      'X-CSRF-Token': generatePrefixCsrfToken(
        { url: path, authn_user_id: fixture.user.id },
        config.secretKey,
      ),
      Cookie: cookie(date, fixture.mode),
      Expect: '100-continue',
    },
  });
  const response = new Promise<IncomingMessage>((resolve, reject) => {
    pending.once('response', resolve);
    pending.once('error', reject);
  });
  const result = response.then(async (res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of res) chunks.push(Buffer.from(chunk));
    return {
      status: res.statusCode,
      body: JSON.parse(Buffer.concat(chunks).toString()) as unknown,
    };
  });
  pending.flushHeaders();
  await once(pending, 'continue');
  pending.write(body.slice(0, -1));
  return { release: () => pending.end(body.slice(-1)), result };
}

describe('Exam grace server', { concurrent: false }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  test('requires the flag and binds the capability to its authenticated owner', async () => {
    await withExam(async (fixture) => {
      await withConfig({ features: { 'exam-grace-period': false } }, async () => {
        await expect(client(fixture, start).context.query()).rejects.toMatchObject({
          data: { code: 'FORBIDDEN' },
        });
      });
      const { token } = await client(fixture, start).context.query();
      await expect(
        client(fixture, at(1_000)).status.query({ token: `${token}x` }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      const [otherUser] = await generateAndEnrollUsers({
        count: 1,
        course_instance_id: courseInstanceId,
      });
      await withUser(otherUser, async () => {
        await expect(
          client(fixture, at(1_000), 'Public', otherUser).status.query({ token }),
        ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      });
    });
  });

  test('keeps ordinary expiry restrictions and saves grace answers with their original credit without grading', async () => {
    await withExam(async (fixture) => {
      const { token } = await client(fixture, start).context.query();
      const ordinary = await fetch(fixture.questionUrl, {
        method: 'POST',
        headers: { Cookie: cookie(at(1_000), fixture.mode) },
        body: new URLSearchParams({
          __csrf_token: fixture.questionCsrfToken,
          __action: 'save',
          __variant_id: fixture.variantId,
          c: '99',
        }),
      });
      expect(ordinary.status).toBe(403);
      const grace = client(fixture, at(1_000));
      const { id } = await grace.beginSave.mutate({ token, variantId: fixture.variantId });
      await expect(
        grace.save.mutate({ token, saveId: id, formData: { __variant_id: '0', c: '17' } }),
      ).rejects.toMatchObject({ data: { code: 'BAD_REQUEST' } });
      await grace.save.mutate({
        token,
        saveId: id,
        formData: { __variant_id: fixture.variantId, c: '17' },
      });
      const submission = await latestSubmission(fixture);
      expect(submission).toMatchObject({
        raw_submitted_answer: { c: '17' },
        submitted_answer: { c: 17 },
        credit: 100,
        grace_period: true,
        graded_at: null,
      });
      const log = await selectAssessmentInstanceLog(fixture.assessmentInstanceId, false);
      expect(log).toContainEqual(
        expect.objectContaining({
          event_name: 'Submission',
          data: expect.objectContaining({ grace_period: true }),
        }),
      );
    });
  });

  test('bounds save permission and lets abandoned saves expire before finalizing', async () => {
    await withExam(async (fixture) => {
      const { token, canSave } = await client(fixture, start).context.query();
      expect(canSave).toBe(true);
      await expect(
        client(fixture, at(-1)).beginSave.mutate({ token, variantId: fixture.variantId }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      const grace = client(fixture, at(1_000));
      const completion = await grace.context.query();
      expect(completion.canSave).toBe(false);
      expect(await grace.status.query({ token: completion.token })).toMatchObject({
        phase: 'grace',
      });
      await expect(
        grace.beginSave.mutate({ token: completion.token, variantId: fixture.variantId }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      const { id } = await grace.beginSave.mutate({ token, variantId: fixture.variantId });
      const save = {
        saveId: id,
        formData: { __variant_id: fixture.variantId, c: '17' },
      };
      await expect(grace.save.mutate({ ...save, token: completion.token })).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
      });
      await grace.save.mutate({ ...save, token });
      expect(await client(fixture, at(30_000)).finish.mutate({ token: completion.token })).toEqual({
        status: 'waiting',
      });
      await client(fixture, at(60_000)).beginSave.mutate({ token, variantId: fixture.variantId });
      await expect(
        client(fixture, at(61_000)).beginSave.mutate({ token, variantId: fixture.variantId }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
      expect(await client(fixture, at(60_001)).finish.mutate({ token })).toEqual({
        status: 'waiting',
      });
      const timerFinished = await finishViaForm(fixture, at(60_001), 'timeLimitFinish');
      expect(timerFinished.status).toBe(302);
      expect((await selectAssessmentInstanceById(fixture.assessmentInstanceId)).open).toBe(true);
      expect(await client(fixture, at(121_000)).finish.mutate({ token: completion.token })).toEqual(
        { status: 'finished' },
      );
      expect((await selectAssessmentInstanceById(fixture.assessmentInstanceId)).open).toBe(false);
    });
  });

  test('uses request arrival before parsing and keeps a delayed admitted upload ahead of finalization', async () => {
    await withExam(async (fixture) => {
      const { token } = await client(fixture, start).context.query();
      const begin = await delayMutation(
        fixture,
        'beginSave',
        { token, variantId: fixture.variantId },
        at(60_100),
      );
      // Body parsing finishes after the cutoff, although the request arrived before it.
      await sleep(250);
      begin.release();
      const admitted = await begin.result;
      expect(admitted.status).toBe(200);
      const saveId = z
        .object({ result: z.object({ data: z.object({ json: z.object({ id: z.uuid() }) }) }) })
        .parse(admitted.body).result.data.json.id;
      const upload = await delayMutation(
        fixture,
        'save',
        { token, saveId, formData: { __variant_id: fixture.variantId, c: '17' } },
        at(61_000),
      );
      try {
        expect(await client(fixture, at(61_100)).finish.mutate({ token })).toEqual({
          status: 'waiting',
        });
      } finally {
        upload.release();
      }
      expect((await upload.result).status).toBe(200);
      expect((await latestSubmission(fixture)).raw_submitted_answer).toEqual({ c: '17' });
      expect(await client(fixture, at(61_200)).finish.mutate({ token })).toEqual({
        status: 'finished',
      });
    });
  });

  test('does not reopen an exam that the student finished manually', async () => {
    await withExam(async (fixture) => {
      const { token } = await client(fixture, start).context.query();
      const finished = await finishViaForm(fixture, start, 'finish');
      expect(finished.status).toBe(302);
      expect((await selectAssessmentInstanceById(fixture.assessmentInstanceId)).open).toBe(false);
      await expect(
        client(fixture, at(1_000)).beginSave.mutate({ token, variantId: fixture.variantId }),
      ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    });
  });

  test.each(['modern', 'legacy'] as const)(
    'allows bounded PrairieTest recovery after ordinary access ends (%s)',
    async (accessModel) => {
      const [user] = await generateAndEnrollUsers({
        count: 1,
        course_instance_id: courseInstanceId,
      });
      const assessment = await selectAssessmentByTid({
        course_instance_id: courseInstanceId,
        tid: 'exam1-automaticTestSuite',
      });
      if (accessModel === 'legacy') {
        await execute(sql.enable_legacy_pt_rule, {
          assessment_id: assessment.id,
          exam_uuid: exam1AutomaticTestSuite.examUuid,
        });
      }
      try {
        await withConfig({ features: { 'exam-grace-period': true } }, () =>
          withUser(user, () =>
            withPTReservation(
              {
                userId: user.id,
                accessStart: start,
                accessEnd: deadline,
                examUuid: exam1AutomaticTestSuite.examUuid,
              },
              async () => {
                const fixture = await createFixture(user, true);
                const { token, source } = await client(fixture, start).context.query();
                expect(source).toBe('prairietest');
                const ordinary = await fetch(fixture.questionUrl, {
                  headers: { Cookie: cookie(at(1_000), 'Public') },
                });
                expect(ordinary.status).toBe(403);
                const grace = client(fixture, at(1_000), 'Public');
                const { id } = await grace.beginSave.mutate({
                  token,
                  variantId: fixture.variantId,
                });
                await grace.save.mutate({
                  token,
                  saveId: id,
                  formData: { __variant_id: fixture.variantId, c: '17' },
                });
                expect(
                  await client(fixture, at(60_001), 'Public').finish.mutate({ token }),
                ).toEqual({ status: 'expired' });
                expect(
                  (await selectAssessmentInstanceById(fixture.assessmentInstanceId)).open,
                ).toBe(true);
                await execute(sql.extend_pt_reservation, {
                  user_id: user.id,
                  access_end: at(120_000),
                });
                await expect(grace.status.query({ token })).rejects.toMatchObject({
                  data: { code: 'FORBIDDEN' },
                });
                const extendedContext = await client(fixture, at(1_000)).context.query();
                expect(extendedContext.deadline).toBe(at(120_000).toISOString());
                if (accessModel === 'legacy') return;
                await execute(sql.set_assessment_instance_dates, {
                  assessment_instance_id: fixture.assessmentInstanceId,
                  date: start,
                  date_limit: at(150_000),
                });
                const late = client(fixture, at(211_000), 'Public');
                await expect(late.context.query()).rejects.toMatchObject({
                  data: { code: 'FORBIDDEN' },
                });
                const timerFinished = await finishViaForm(
                  { ...fixture, mode: 'Public' },
                  at(211_000),
                  'timeLimitFinish',
                );
                expect(timerFinished.status).toBe(302);
                expect(await late.finish.mutate({ token: extendedContext.token })).toEqual({
                  status: 'expired',
                });
                expect(
                  (await selectAssessmentInstanceById(fixture.assessmentInstanceId)).open,
                ).toBe(true);
              },
            ),
          ),
        );
      } finally {
        if (accessModel === 'legacy') {
          await execute(sql.restore_modern_pt_rule, { assessment_id: assessment.id });
        }
      }
    },
  );
});
