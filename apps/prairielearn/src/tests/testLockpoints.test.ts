import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';
import { SprocQuestionOrderSchema } from '../lib/db-types.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

describe('Assessment lockpoints', { timeout: 60_000 }, function () {
  const context = { siteUrl: `http://localhost:${config.serverPort}` } as {
    siteUrl: string;
    baseUrl: string;
    courseInstanceBaseUrl: string;
    assessmentId: string;
    lockpointZoneIds: string[];
    assessmentUrl: string;
    assessmentInstanceId: string;
    assessmentInstanceUrl: string;
    questionStates: {
      id: number;
      question_access_mode:
        | 'writable'
        | 'blocked_sequence'
        | 'blocked_lockpoint'
        | 'read_only_lockpoint';
      url: string;
    }[];
    __csrf_token: string;
    __variant_id: string;
  };
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

  beforeAll(async function () {
    await helperServer.before()();
    context.assessmentId = await sqldb.queryRow(sql.select_lockpoint_exam, IdSchema);
    context.lockpointZoneIds = (
      await sqldb.queryRows(
        sql.select_lockpoint_zone_ids,
        { assessment_id: context.assessmentId },
        IdSchema,
      )
    ).map(String);
    assert.isAtLeast(context.lockpointZoneIds.length, 2);
    context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
  });

  afterAll(helperServer.after);

  async function refreshQuestionStates() {
    const rows = await sqldb.callRows(
      'question_order',
      [context.assessmentInstanceId],
      SprocQuestionOrderSchema,
    );
    context.questionStates = rows
      .sort((a, b) => a.row_order - b.row_order)
      .map((row) => ({
        id: Number(row.instance_question_id),
        question_access_mode: row.question_access_mode,
        url: `${context.courseInstanceBaseUrl}/instance_question/${row.instance_question_id}/`,
      }));
  }

  async function fetchAssessmentInstancePageWithLockpointModal() {
    const assessmentInstanceResponse = await helperClient.fetchCheerio(
      context.assessmentInstanceUrl,
    );
    assert.isTrue(assessmentInstanceResponse.ok);

    const lockpointModal = assessmentInstanceResponse.$('[id^="crossLockpointModal-"]').first();
    if (lockpointModal.length === 0) throw new Error('No crossable lockpoint found');

    const csrfToken = lockpointModal.find('input[name="__csrf_token"]').attr('value');
    if (csrfToken == null) throw new Error('Missing lockpoint CSRF token');
    context.__csrf_token = csrfToken;

    return assessmentInstanceResponse;
  }

  async function postCrossLockpoint(zoneId: string) {
    return await helperClient.fetchCheerio(context.assessmentInstanceUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'cross_lockpoint',
        __csrf_token: context.__csrf_token,
        zone_id: zoneId,
      }),
    });
  }

  async function crossNextLockpoint() {
    const assessmentInstanceResponse = await fetchAssessmentInstancePageWithLockpointModal();
    const lockpointModal = assessmentInstanceResponse.$('[id^="crossLockpointModal-"]').first();

    const zoneId = lockpointModal.find('input[name="zone_id"]').attr('value');
    if (zoneId == null) throw new Error('Missing lockpoint zone_id');

    const response = await postCrossLockpoint(zoneId);
    assert.isTrue(response.ok);
    return response;
  }

  test.sequential(
    'creates an assessment instance and initializes lockpoint state',
    async function () {
      const assessmentCreateResponse = await helperClient.fetchCheerio(context.assessmentUrl);
      assert.isTrue(assessmentCreateResponse.ok);
      helperClient.extractAndSaveCSRFToken(context, assessmentCreateResponse.$, 'form');

      const response = await helperClient.fetchCheerio(context.assessmentUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'new_instance',
          __csrf_token: context.__csrf_token,
        }),
      });
      assert.isTrue(response.ok);

      context.assessmentInstanceUrl = response.url;
      const match = response.url.match(/assessment_instance\/(\d+)/);
      if (match == null) throw new Error('Missing assessment_instance_id in redirect URL');
      context.assessmentInstanceId = match[1];

      await refreshQuestionStates();
      assert.lengthOf(context.questionStates, 3);
      assert.deepEqual(
        context.questionStates.map((row) => row.question_access_mode),
        ['writable', 'blocked_lockpoint', 'blocked_lockpoint'],
      );

      assert.equal(response.$('button[data-bs-target^="#crossLockpointModal-"]').length, 1);
      assert.equal(
        response.$(`a[href*="instance_question/${context.questionStates[1].id}"]`).length,
        0,
      );
    },
  );

  test.sequential('lockpoints cannot be crossed out of order', async function () {
    await fetchAssessmentInstancePageWithLockpointModal();
    const response = await postCrossLockpoint(context.lockpointZoneIds[1]);
    assert.isFalse(response.ok);
    assert.equal(response.status, 403);

    await refreshQuestionStates();
    assert.deepEqual(
      context.questionStates.map((row) => row.question_access_mode),
      ['writable', 'blocked_lockpoint', 'blocked_lockpoint'],
    );
  });

  test.sequential(
    'lockpoint-not-yet-crossed question is not directly accessible',
    async function () {
      const response = await helperClient.fetchCheerio(context.questionStates[1].url);
      assert.isFalse(response.ok);
      assert.equal(response.status, 403);
    },
  );

  test.sequential('next-question navigation explains lockpoint requirement', async function () {
    const response = await helperClient.fetchCheerio(context.questionStates[0].url);
    assert.isTrue(response.ok);
    assert.isTrue(response.$('#question-nav-next').hasClass('pl-sequence-locked'));
    assert.include(
      response.$('#question-nav-next').attr('data-bs-content') ?? '',
      'You must cross the lockpoint on the assessment overview page',
    );
  });

  test.sequential(
    'crossing the first lockpoint makes previous questions read-only',
    async function () {
      const response = await crossNextLockpoint();
      await refreshQuestionStates();

      assert.deepEqual(
        context.questionStates.map((row) => row.question_access_mode),
        ['read_only_lockpoint', 'writable', 'blocked_lockpoint'],
      );

      assert.include(response.$.html(), 'read-only because you have advanced past a lockpoint');
    },
  );

  test.sequential('crossing an already crossed lockpoint is idempotent', async function () {
    await fetchAssessmentInstancePageWithLockpointModal();
    const response = await postCrossLockpoint(context.lockpointZoneIds[0]);
    assert.isTrue(response.ok);

    await refreshQuestionStates();
    assert.deepEqual(
      context.questionStates.map((row) => row.question_access_mode),
      ['read_only_lockpoint', 'writable', 'blocked_lockpoint'],
    );
  });

  test.sequential('read-only questions can be viewed but cannot be submitted', async function () {
    const questionResponse = await helperClient.fetchCheerio(context.questionStates[0].url);
    assert.isTrue(questionResponse.ok);
    assert.include(
      questionResponse.$.html(),
      'This question is read-only because you advanced past a lockpoint',
    );

    helperClient.extractAndSaveCSRFToken(context, questionResponse.$, '.question-form');
    context.__variant_id =
      questionResponse.$('.question-form input[name="__variant_id"]').attr('value') ?? '';
    assert.isNotEmpty(context.__variant_id);

    const submitResponse = await helperClient.fetchCheerio(context.questionStates[0].url, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'grade',
        __variant_id: context.__variant_id,
        __csrf_token: context.__csrf_token,
      }),
    });
    assert.isFalse(submitResponse.ok);
    assert.equal(submitResponse.status, 403);
  });

  test.sequential(
    'crossing subsequent lockpoints is sequential and updates read-only state',
    async function () {
      await crossNextLockpoint();
      await refreshQuestionStates();

      assert.deepEqual(
        context.questionStates.map((row) => row.question_access_mode),
        ['read_only_lockpoint', 'read_only_lockpoint', 'writable'],
      );
    },
  );
});
