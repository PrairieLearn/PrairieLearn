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
    assessmentUrl: string;
    assessmentInstanceId: string;
    assessmentInstanceUrl: string;
    questionStates: {
      id: number;
      lockpoint_not_yet_crossed: boolean;
      lockpoint_read_only: boolean;
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
        lockpoint_not_yet_crossed: row.lockpoint_not_yet_crossed,
        lockpoint_read_only: row.lockpoint_read_only,
        url: `${context.courseInstanceBaseUrl}/instance_question/${row.instance_question_id}/`,
      }));
  }

  async function crossNextLockpoint() {
    const assessmentInstanceResponse = await helperClient.fetchCheerio(
      context.assessmentInstanceUrl,
    );
    assert.isTrue(assessmentInstanceResponse.ok);
    const lockpointModal = assessmentInstanceResponse.$('[id^="crossLockpointModal-"]').first();
    if (lockpointModal.length === 0) throw new Error('No crossable lockpoint found');

    const csrfToken = lockpointModal.find('input[name="__csrf_token"]').attr('value');
    const zoneId = lockpointModal.find('input[name="zone_id"]').attr('value');
    if (csrfToken == null || zoneId == null) throw new Error('Missing lockpoint form fields');
    context.__csrf_token = csrfToken;

    const response = await helperClient.fetchCheerio(context.assessmentInstanceUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'cross_lockpoint',
        __csrf_token: context.__csrf_token,
        zone_id: zoneId,
      }),
    });
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
        context.questionStates.map((row) => row.lockpoint_not_yet_crossed),
        [false, true, true],
      );
      assert.deepEqual(
        context.questionStates.map((row) => row.lockpoint_read_only),
        [false, false, false],
      );

      assert.equal(response.$('button[data-bs-target^="#crossLockpointModal-"]').length, 1);
      assert.equal(
        response.$(`a[href*="instance_question/${context.questionStates[1].id}"]`).length,
        0,
      );
    },
  );

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
        context.questionStates.map((row) => row.lockpoint_not_yet_crossed),
        [false, false, true],
      );
      assert.deepEqual(
        context.questionStates.map((row) => row.lockpoint_read_only),
        [true, false, false],
      );

      assert.include(response.$.html(), 'read-only because you have advanced past a lockpoint');
    },
  );

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
        context.questionStates.map((row) => row.lockpoint_not_yet_crossed),
        [false, false, false],
      );
      assert.deepEqual(
        context.questionStates.map((row) => row.lockpoint_read_only),
        [true, true, false],
      );
    },
  );
});
