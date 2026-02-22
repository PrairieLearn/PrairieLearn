import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { config } from '../lib/config.js';
import { SprocQuestionOrderSchema } from '../lib/db-types.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

describe(
  'Assessment that forces students to complete questions in-order',
  { timeout: 60_000 },
  function () {
    const context = { siteUrl: `http://localhost:${config.serverPort}` } as {
      siteUrl: string;
      baseUrl: string;
      courseInstanceBaseUrl: string;
      assessmentId: string;
      assessmentInstanceId: string;
      assessmentInstanceUrl: string;
      assessmentUrl: string;
      instructorAssessmentQuestionsUrl: string;
      expectedPercentages: number[];
      instanceQuestions: { id: number; locked: boolean; url: string }[];
      lockedQuestion: { id: number; url: string };
      firstUnlockedQuestion: { id: number; url: string };
      __csrf_token: string;
      __variant_id: string;
    };
    context.baseUrl = `${context.siteUrl}/pl`;
    context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;

    beforeAll(async function () {
      await helperServer.before()();
      const assessmentId = await sqldb.queryRow(sql.select_sequential_exam, IdSchema);
      context.assessmentId = assessmentId;
      context.assessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.assessmentId}/`;
      context.instructorAssessmentQuestionsUrl = `${context.courseInstanceBaseUrl}/instructor/assessment/${context.assessmentId}/questions/`;
    });

    afterAll(helperServer.after);

    test.sequential(
      'Minimum advancement score is computed correctly for each question',
      async function () {
        const response = await helperClient.fetchCheerio(context.instructorAssessmentQuestionsUrl, {
          method: 'GET',
        });
        assert.isTrue(response.ok);

        context.expectedPercentages = [0, 60, 75, 0, 30, 100];
        const computedPercentages = response
          .$('[data-testid="advance-score-perc"]')
          .map((i, elem) => {
            // turn string "25%" -> number 25
            return Number(response.$(elem).text().trim().slice(0, -1));
          })
          .get();
        assert.deepEqual(computedPercentages, context.expectedPercentages);
      },
    );

    /**
     * Updates context.instanceQuestions to the current state of the assessment instance
     */
    async function refreshContextQuestions() {
      const results = await sqldb.callRows(
        'question_order',
        [context.assessmentInstanceId],
        SprocQuestionOrderSchema,
      );
      context.instanceQuestions = results.map((e) => {
        return {
          id: Number(e.instance_question_id),
          locked: e.question_access_mode === 'blocked_sequence',
          url: `${context.courseInstanceBaseUrl}/instance_question/${e.instance_question_id}/`,
        };
      });
    }

    test.sequential(
      'Questions are locked/unlocked properly on student assessment page',
      async function () {
        // Generate assessment instance
        const assessmentCreateResponse = await helperClient.fetchCheerio(context.assessmentUrl);
        helperClient.extractAndSaveCSRFToken(context, assessmentCreateResponse.$, 'form');
        const response = await helperClient.fetchCheerio(context.assessmentUrl, {
          method: 'POST',
          body: new URLSearchParams({
            __action: 'new_instance',
            __csrf_token: context.__csrf_token,
          }),
        });
        assert.isTrue(response.ok);

        // We should have been redirected to the assessment instance
        context.assessmentInstanceUrl = response.url;
        assert.include(context.assessmentInstanceUrl, '/assessment_instance/');

        const urlParts = context.assessmentInstanceUrl.split('/');
        context.assessmentInstanceId = urlParts[urlParts.length - 1];
        await refreshContextQuestions();

        const initialExpectedLocks = [false, false, true, true, true, true];

        assert.deepEqual(
          context.instanceQuestions.map((e) => {
            return e.locked;
          }),
          initialExpectedLocks,
        );

        const computedLocks = response
          .$('table[data-testid="assessment-questions"] tbody tr')
          .filter((i, elem) => response.$(elem).find('td').length > 0)
          .map((i, elem) => {
            return response.$(elem).hasClass('pl-sequence-locked');
          })
          .get();
        assert.deepEqual(computedLocks, initialExpectedLocks);

        assert.include(
          response
            .$('table[data-testid="assessment-questions"] tbody tr')
            .filter((i, elem) => response.$(elem).find('td').length > 0)
            .eq(2)
            .html(),
          '60% on Question 2',
        );
      },
    );

    test.sequential('Accessing Question 3 returns a 403', async function () {
      context.lockedQuestion = context.instanceQuestions[2];
      const response = await helperClient.fetchCheerio(context.lockedQuestion.url);
      assert.isTrue(!response.ok);
      assert.equal(response.status, 403);
    });

    test.sequential(
      'Question 3 URL is not exposed from student assessment page',
      async function () {
        const response = await helperClient.fetchCheerio(context.assessmentUrl);
        assert.isTrue(response.ok);
        assert.equal(
          response.$(`a[href*="instance_question/${context.lockedQuestion.id}"]`).length,
          0,
        );
      },
    );

    test.sequential(
      'Question 2 "next question" link is locked before any submissions',
      async function () {
        context.firstUnlockedQuestion = context.instanceQuestions[1];
        const response = await helperClient.fetchCheerio(context.firstUnlockedQuestion.url);
        assert.isTrue(response.ok);

        assert.isTrue(response.$('#question-nav-next').hasClass('pl-sequence-locked'));
      },
    );

    test.sequential(
      'Question 2 "next question" link contains the correct advanceScorePerc',
      async function () {
        const response = await submitQuestion(50, context.firstUnlockedQuestion);
        assert.include(response.$('#question-nav-next').attr('data-bs-content'), '60%');
      },
    );

    async function submitQuestion(score: number, question: { id: number; url: string }) {
      const preSubmissionResponse = await helperClient.fetchCheerio(question.url);
      assert.isTrue(preSubmissionResponse.ok);
      helperClient.extractAndSaveCSRFToken(context, preSubmissionResponse.$, '.question-form');
      context.__variant_id =
        preSubmissionResponse.$('.question-form input[name="__variant_id"]').attr('value') ?? '';
      const response = await helperClient.fetchCheerio(question.url, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __variant_id: context.__variant_id,
          s: String(score),
          __csrf_token: context.__csrf_token,
        }),
      });
      assert.isTrue(response.ok);

      return response;
    }

    test.sequential('Submitting 50% on Question 2 does not unlock Question 3', async function () {
      const response = await submitQuestion(50, context.firstUnlockedQuestion);
      assert.isTrue(response.$('#question-nav-next').hasClass('pl-sequence-locked'));
    });

    test.sequential('Submitting 75% on Question 2 unlocks Question 3', async function () {
      const response = await submitQuestion(75, context.firstUnlockedQuestion);
      assert.isFalse(response.$('#question-nav-next').hasClass('pl-sequence-locked'));
    });

    test.sequential('Submitting 0% on Question 2 leaves Question 3 unlocked', async function () {
      const response = await submitQuestion(0, context.firstUnlockedQuestion);
      assert.isFalse(response.$('#question-nav-next').hasClass('pl-sequence-locked'));
    });

    test.sequential(
      'Accessing Question 3 no longer returns a 403 and Question 4 is locked',
      async function () {
        const response = await helperClient.fetchCheerio(context.lockedQuestion.url);
        assert.isTrue(response.ok);
        assert.isTrue(response.$('#question-nav-next').hasClass('pl-sequence-locked'));
      },
    );

    test.sequential(
      'Submitting 0% on Question 3 unlocks Question 4 (run out of attempts)',
      async function () {
        const response = await submitQuestion(0, context.lockedQuestion);
        assert.isTrue(response.ok);
        assert.isFalse(response.$('#question-nav-next').hasClass('pl-sequence-locked'));
      },
    );

    test.sequential('Unlocking question 4 cascades to question 5', async function () {
      await refreshContextQuestions();
      assert.isFalse(context.instanceQuestions[4].locked);
    });

    test.sequential('Unlocking question 4 does NOT cascade to question 6', function () {
      assert.isTrue(context.instanceQuestions[5].locked);
    });
  },
);
