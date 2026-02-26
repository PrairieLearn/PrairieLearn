import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';
import { SprocQuestionOrderSchema } from '../lib/db-types.js';
import { selectAssessmentInstanceById } from '../models/assessment-instance.js';
import { selectAssessmentByTid } from '../models/assessment.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

interface QuestionState {
  id: number;
  question_access_mode:
    | 'default'
    | 'blocked_sequence'
    | 'blocked_lockpoint'
    | 'read_only_lockpoint';
  url: string;
}

const testUsers = [
  { authUid: 'student1@example.com', authName: 'Student User 1', authUin: '00000001' },
  { authUid: 'student2@example.com', authName: 'Student User 2', authUin: '00000002' },
  { authUid: 'student3@example.com', authName: 'Student User 3', authUin: '00000003' },
] as const;

describe('Assessment lockpoints', { timeout: 60_000 }, function () {
  const context = { siteUrl: `http://localhost:${config.serverPort}` } as {
    siteUrl: string;
    baseUrl: string;
    courseInstanceBaseUrl: string;
    assessmentId: string;
    lockpointAdvanceAssessmentId: string;
    lockpointHomeworkAssessmentId: string;
    lockpointZoneIds: string[];
    assessmentUrl: string;
    assessmentInstanceId: string;
    assessmentInstanceUrl: string;
    questionStates: QuestionState[];
    __csrf_token: string;
    __variant_id: string;
  };
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

  beforeAll(async function () {
    await helperServer.before()();
    const courseInstanceId = '1';
    context.assessmentId = (
      await selectAssessmentByTid({
        course_instance_id: courseInstanceId,
        tid: 'exam18-lockpoints',
      })
    ).id;
    context.lockpointAdvanceAssessmentId = (
      await selectAssessmentByTid({
        course_instance_id: courseInstanceId,
        tid: 'exam19-lockpoints-advance',
      })
    ).id;
    context.lockpointHomeworkAssessmentId = (
      await selectAssessmentByTid({
        course_instance_id: courseInstanceId,
        tid: 'hw15-lockpoints',
      })
    ).id;
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

  async function selectQuestionStates(assessmentInstanceId: string): Promise<QuestionState[]> {
    const rows = await sqldb.callRows(
      'question_order',
      [assessmentInstanceId],
      SprocQuestionOrderSchema,
    );
    return rows
      .sort((a, b) => a.row_order - b.row_order)
      .map((row) => ({
        id: Number(row.instance_question_id),
        question_access_mode: row.question_access_mode,
        url: `${context.courseInstanceBaseUrl}/instance_question/${row.instance_question_id}/`,
      }));
  }

  async function refreshQuestionStates() {
    context.questionStates = await selectQuestionStates(context.assessmentInstanceId);
  }

  async function createAssessmentInstance(assessmentId: string): Promise<{
    assessmentUrl: string;
    assessmentInstanceId: string;
    assessmentInstanceUrl: string;
  }> {
    const assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${assessmentId}/`;
    const assessmentCreateResponse = await helperClient.fetchCheerio(assessmentUrl);
    assert.isTrue(assessmentCreateResponse.ok);
    if (assessmentCreateResponse.url.includes('/assessment_instance/')) {
      return {
        assessmentUrl,
        assessmentInstanceId: String(
          helperClient.parseAssessmentInstanceId(assessmentCreateResponse.url),
        ),
        assessmentInstanceUrl: assessmentCreateResponse.url,
      };
    }

    const csrfToken = helperClient.getCSRFToken(assessmentCreateResponse.$);
    const newInstanceResponse = await helperClient.fetchCheerio(assessmentUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'new_instance',
        __csrf_token: csrfToken,
      }),
    });
    assert.isTrue(newInstanceResponse.ok);

    return {
      assessmentUrl,
      assessmentInstanceId: String(helperClient.parseAssessmentInstanceId(newInstanceResponse.url)),
      assessmentInstanceUrl: newInstanceResponse.url,
    };
  }

  async function postCrossLockpointForInstance(assessmentInstanceUrl: string, zoneId: string) {
    const assessmentInstanceResponse = await helperClient.fetchCheerio(assessmentInstanceUrl);
    assert.isTrue(assessmentInstanceResponse.ok);
    const csrfToken = helperClient.getCSRFToken(assessmentInstanceResponse.$);
    return await helperClient.fetchCheerio(assessmentInstanceUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'cross_lockpoint',
        __csrf_token: csrfToken,
        zone_id: zoneId,
      }),
    });
  }

  async function gradeQuestionWithScore(questionUrl: string, score: number) {
    const questionResponse = await helperClient.fetchCheerio(questionUrl);
    assert.isTrue(questionResponse.ok);
    const csrfToken = helperClient.getCSRFToken(questionResponse.$);
    const variantId = questionResponse.$('.question-form input[name="__variant_id"]').attr('value');
    assert.isString(variantId);
    return await helperClient.fetchCheerio(questionUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'grade',
        __variant_id: variantId!,
        __csrf_token: csrfToken,
        s: String(score),
      }),
    });
  }

  async function fetchAssessmentInstancePageWithLockpointModal() {
    const assessmentInstanceResponse = await helperClient.fetchCheerio(
      context.assessmentInstanceUrl,
    );
    assert.isTrue(assessmentInstanceResponse.ok);

    const lockpointModal = assessmentInstanceResponse.$('[id^="crossLockpointModal-"]').first();
    assert.lengthOf(lockpointModal, 1);

    const csrfToken = lockpointModal.find('input[name="__csrf_token"]').attr('value');
    assert.isString(csrfToken);
    context.__csrf_token = csrfToken!;

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
    assert.isString(zoneId);

    const response = await postCrossLockpoint(zoneId!);
    assert.isTrue(response.ok);
    return response;
  }

  test.sequential(
    'creates an assessment instance and initializes lockpoint state',
    async function () {
      const created = await createAssessmentInstance(context.assessmentId);
      context.assessmentInstanceUrl = created.assessmentInstanceUrl;
      context.assessmentInstanceId = created.assessmentInstanceId;
      const response = await helperClient.fetchCheerio(created.assessmentInstanceUrl);
      assert.isTrue(response.ok);

      await refreshQuestionStates();
      assert.lengthOf(context.questionStates, 3);
      assert.deepEqual(
        context.questionStates.map((row) => row.question_access_mode),
        ['default', 'blocked_lockpoint', 'blocked_lockpoint'],
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
      ['default', 'blocked_lockpoint', 'blocked_lockpoint'],
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
        ['read_only_lockpoint', 'default', 'blocked_lockpoint'],
      );

      assert.include(
        response.$.html(),
        'You can no longer submit answers to this question because you have advanced past a lockpoint',
      );
    },
  );

  test.sequential('crossing an already crossed lockpoint is idempotent', async function () {
    await fetchAssessmentInstancePageWithLockpointModal();
    const response = await postCrossLockpoint(context.lockpointZoneIds[0]);
    assert.isTrue(response.ok);

    await refreshQuestionStates();
    assert.deepEqual(
      context.questionStates.map((row) => row.question_access_mode),
      ['read_only_lockpoint', 'default', 'blocked_lockpoint'],
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
        ['read_only_lockpoint', 'read_only_lockpoint', 'default'],
      );
    },
  );

  test.sequential('finish action is allowed with uncrossed lockpoints', async function () {
    const previousUser = {
      authUid: config.authUid,
      authName: config.authName,
      authUin: config.authUin,
    };
    helperClient.setUser(testUsers[0]);
    try {
      const created = await createAssessmentInstance(context.assessmentId);
      const assessmentInstanceResponse = await helperClient.fetchCheerio(
        created.assessmentInstanceUrl,
      );
      assert.isTrue(assessmentInstanceResponse.ok);
      const csrfToken = helperClient.getCSRFToken(assessmentInstanceResponse.$);

      const finishResponse = await helperClient.fetchCheerio(created.assessmentInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'finish',
          __csrf_token: csrfToken,
        }),
      });
      assert.isTrue(finishResponse.ok);

      const assessmentInstance = await selectAssessmentInstanceById(created.assessmentInstanceId);
      assert.isFalse(assessmentInstance.open);
    } finally {
      helperClient.setUser(previousUser);
    }
  });

  test.sequential(
    'advanceScorePerc in prior zones blocks lockpoint crossing until satisfied',
    async function () {
      const previousUser = {
        authUid: config.authUid,
        authName: config.authName,
        authUin: config.authUin,
      };
      helperClient.setUser(testUsers[1]);
      try {
        const advanceLockpointZoneIds = (
          await sqldb.queryRows(
            sql.select_lockpoint_zone_ids,
            { assessment_id: context.lockpointAdvanceAssessmentId },
            IdSchema,
          )
        ).map(String);
        assert.lengthOf(advanceLockpointZoneIds, 1);

        const created = await createAssessmentInstance(context.lockpointAdvanceAssessmentId);

        let questionStates = await selectQuestionStates(created.assessmentInstanceId);
        // Q0 has advanceScorePerc, so Q1-Q3 are all blocked_sequence.
        assert.deepEqual(
          questionStates.map((row) => row.question_access_mode),
          ['default', 'blocked_sequence', 'blocked_sequence', 'blocked_sequence'],
        );

        // Crossing should be rejected because the first advanceScorePerc is unmet.
        const rejectedCrossResponse = await postCrossLockpointForInstance(
          created.assessmentInstanceUrl,
          advanceLockpointZoneIds[0],
        );
        assert.isFalse(rejectedCrossResponse.ok);
        assert.equal(rejectedCrossResponse.status, 403);

        // Satisfy Q0's advanceScorePerc.
        const gradeResponse = await gradeQuestionWithScore(questionStates[0].url, 100);
        assert.isTrue(gradeResponse.ok);

        questionStates = await selectQuestionStates(created.assessmentInstanceId);
        // Q0 and Q1 are now accessible. Q2 has advanceScorePerc (last in zone 1),
        // so its blocked_sequence propagates into the lockpoint zone (Q3).
        assert.deepEqual(
          questionStates.map((row) => row.question_access_mode),
          ['default', 'default', 'default', 'blocked_sequence'],
        );

        // Crossing should still be rejected because Q2's advanceScorePerc is unmet.
        const stillRejectedResponse = await postCrossLockpointForInstance(
          created.assessmentInstanceUrl,
          advanceLockpointZoneIds[0],
        );
        assert.isFalse(stillRejectedResponse.ok);
        assert.equal(stillRejectedResponse.status, 403);

        // Satisfy Q2's advanceScorePerc.
        const gradeResponse2 = await gradeQuestionWithScore(questionStates[2].url, 100);
        assert.isTrue(gradeResponse2.ok);

        questionStates = await selectQuestionStates(created.assessmentInstanceId);
        assert.deepEqual(
          questionStates.map((row) => row.question_access_mode),
          ['default', 'default', 'default', 'blocked_lockpoint'],
        );

        // Now crossing should succeed.
        const acceptedCrossResponse = await postCrossLockpointForInstance(
          created.assessmentInstanceUrl,
          advanceLockpointZoneIds[0],
        );
        assert.isTrue(acceptedCrossResponse.ok);

        questionStates = await selectQuestionStates(created.assessmentInstanceId);
        assert.deepEqual(
          questionStates.map((row) => row.question_access_mode),
          ['read_only_lockpoint', 'read_only_lockpoint', 'read_only_lockpoint', 'default'],
        );
      } finally {
        helperClient.setUser(previousUser);
      }
    },
  );

  test.sequential(
    'homework lockpoints transition from blocked to read-only after crossing',
    async function () {
      const previousUser = {
        authUid: config.authUid,
        authName: config.authName,
        authUin: config.authUin,
      };
      helperClient.setUser(testUsers[2]);
      try {
        const homeworkLockpointZoneIds = (
          await sqldb.queryRows(
            sql.select_lockpoint_zone_ids,
            { assessment_id: context.lockpointHomeworkAssessmentId },
            IdSchema,
          )
        ).map(String);
        assert.lengthOf(homeworkLockpointZoneIds, 1);

        const created = await createAssessmentInstance(context.lockpointHomeworkAssessmentId);

        let questionStates = await selectQuestionStates(created.assessmentInstanceId);
        assert.deepEqual(
          questionStates.map((row) => row.question_access_mode),
          ['default', 'blocked_lockpoint'],
        );

        const crossResponse = await postCrossLockpointForInstance(
          created.assessmentInstanceUrl,
          homeworkLockpointZoneIds[0],
        );
        assert.isTrue(crossResponse.ok);

        questionStates = await selectQuestionStates(created.assessmentInstanceId);
        assert.deepEqual(
          questionStates.map((row) => row.question_access_mode),
          ['read_only_lockpoint', 'default'],
        );
      } finally {
        helperClient.setUser(previousUser);
      }
    },
  );
});
