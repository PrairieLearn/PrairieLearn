import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { AssessmentInstanceSchema } from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { ensureEnrollment } from '../models/enrollment.js';
import { selectUserByUid } from '../models/user.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

describe(
  'Exam and homework assessment with active access restriction',
  { timeout: 60_000 },
  function () {
    const storedConfig: Record<string, any> = {};
    const context: Record<string, any> = {};
    context.siteUrl = `http://localhost:${config.serverPort}`;
    context.baseUrl = `${context.siteUrl}/pl`;

    const headers: Record<string, string> = {};

    const VARIANT_FORBIDDEN_STRING = 'This question was not viewed while the assessment was open';

    beforeAll(function () {
      storedConfig.authUid = config.authUid;
      storedConfig.authName = config.authName;
      storedConfig.authUin = config.authUin;
      config.authUid = 'student@example.com';
      config.authName = 'Student User';
      config.authUin = '00000001';
    });

    beforeAll(async function () {
      await helperServer.before()();
      const { id: examId } = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'exam11-activeAccessRestriction',
      });
      const { id: hwId } = await selectAssessmentByTid({
        course_instance_id: '1',
        tid: 'hw8-activeAccessRestriction',
      });
      context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;
      context.assessmentListUrl = `${context.courseInstanceBaseUrl}/assessments`;
      context.gradeBookUrl = `${context.courseInstanceBaseUrl}/gradebook`;
      context.examId = examId;
      context.examUrl = `${context.courseInstanceBaseUrl}/assessment/${context.examId}/`;

      context.hwId = hwId;
      context.hwUrl = `${context.courseInstanceBaseUrl}/assessment/${context.hwId}/`;
      context.hwNumber = '8';
    });

    afterAll(helperServer.after);

    afterAll(function () {
      Object.assign(config, storedConfig);
    });

    test.sequential('visit home page', async () => {
      const response = await helperClient.fetchCheerio(context.baseUrl, {
        headers,
      });
      assert.isTrue(response.ok);
    });

    test.sequential('enroll the test student user in the course', async () => {
      const user = await selectUserByUid('student@example.com');
      await ensureEnrollment({ user_id: user.user_id, course_instance_id: '1' });
    });

    test.sequential(
      'ensure that the exam is not visible on the assessments page when no access rule applies',
      async () => {
        headers.cookie = 'pl_test_date=1850-06-01T00:00:01Z';

        const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
        assert.isTrue(response.ok);

        assert.lengthOf(response.$('a:contains("Test Active Access Rule")'), 0);
      },
    );

    test.sequential('try to access the exam when no access rule applies', async () => {
      headers.cookie = 'pl_test_date=1850-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.examUrl, {
        headers,
      });
      assert.equal(response.status, 403);
    });

    test.sequential(
      'ensure that the exam is visible without a link on the assessments page if student has not started the exam and active is false',
      async () => {
        headers.cookie = 'pl_test_date=2000-06-01T00:00:01Z';

        const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
        assert.isTrue(response.ok);

        assert.lengthOf(response.$('td:contains("Test Active Access Rule")'), 1);
        assert.lengthOf(response.$('a:contains("Test Active Access Rule")'), 0); // there should be no link
      },
    );

    test.sequential('try to access the exam when it is not active', async () => {
      headers.cookie = 'pl_test_date=2000-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.examUrl, {
        headers,
      });
      assert.equal(response.status, 403);

      const msg = response.$('[data-testid="assessment-closed-message"]');
      assert.lengthOf(msg, 1);
      assert.match(msg.text(), /Assessment will become available on 2010-01-01 00:00:01/);
    });

    test.sequential('check that an assessment instance was not created', async () => {
      const results = await sqldb.queryRows(
        sql.select_assessment_instances,
        AssessmentInstanceSchema,
      );
      assert.equal(results.length, 0);
    });

    test.sequential(
      'ensure that a link to the exam is visible on the assessments page if active is true',
      async () => {
        headers.cookie = 'pl_test_date=2010-01-01T23:50:01Z';

        const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
        assert.isTrue(response.ok);

        assert.lengthOf(response.$('a:contains("Test Active Access Rule")'), 1);
      },
    );

    test.sequential('visit start exam page when the exam is active', async () => {
      headers.cookie = 'pl_test_date=2010-01-01T23:50:01Z';

      const response = await helperClient.fetchCheerio(context.examUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      assert.equal(response.$('#start-assessment').text().trim(), 'Start assessment');

      helperClient.extractAndSaveCSRFToken(context, response.$, 'form');
    });

    test.sequential('start the exam and access questions', async () => {
      const response = await helperClient.fetchCheerio(context.examUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'new_instance',
          __csrf_token: context.__csrf_token,
        }),
        headers,
      });
      assert.isTrue(response.ok);

      // We should have been redirected to the assessment instance
      const examInstanceUrl = response.url;
      assert.include(examInstanceUrl, '/assessment_instance/');
      context.examInstanceUrl = examInstanceUrl;

      // Save context for future tests
      context.__csrf_token = response.$('span[id=test_csrf_token]').text();
      const questionWithVariantPath = response.$('a:contains("Question 1")').attr('href');
      const questionWithoutVariantPath = response.$('a:contains("Question 2")').attr('href');
      const questionWithWorkspace = response.$('a:contains("Question 7")').attr('href');
      context.examQuestionUrl = `${context.siteUrl}${questionWithVariantPath}`;
      context.examQuestionWithoutVariantUrl = `${context.siteUrl}${questionWithoutVariantPath}`;
      context.examQuestionWithWorkspaceUrl = `${context.siteUrl}${questionWithWorkspace}`;

      // Access the question to create a variant.
      const questionResponse = await helperClient.fetchCheerio(context.examQuestionUrl, {
        headers,
      });
      assert.isTrue(questionResponse.ok);

      // Access the workspace question.
      const workspaceQuestionResponse = await helperClient.fetchCheerio(
        context.examQuestionWithWorkspaceUrl,
        { headers },
      );
      assert.isTrue(workspaceQuestionResponse.ok);
      const workspaceUrl = workspaceQuestionResponse.$('a:contains("Open workspace")').attr('href');
      context.examWorkspaceUrl = `${context.siteUrl}${workspaceUrl}`;

      // Access the workspace to create it.
      const workspaceResponse = await helperClient.fetchCheerio(context.examWorkspaceUrl, {
        headers,
      });
      assert.isTrue(workspaceResponse.ok);
    });

    test.sequential('count number of variants generated', async () => {
      context.numberOfVariants = await sqldb.queryRow(
        sql.count_variants,
        { assessment_instance_id: helperClient.parseAssessmentInstanceId(context.examInstanceUrl) },
        z.number(),
      );
      assert.equal(context.numberOfVariants, 2);
    });

    test.sequential('simulate a time limit expiration', async () => {
      const response = await helperClient.fetchCheerio(context.examInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'timeLimitFinish',
          __csrf_token: context.__csrf_token,
        }),
        headers,
      });

      // At this time, showClosedAssessment is true, so the status of the HTTP response should be 200
      assert.isTrue(response.ok);

      // We should have been redirected back to the same assessment instance
      assert.equal(response.url, `${context.examInstanceUrl}?timeLimitExpired=true`);

      // Since showClosedAssessment is true, Question 1 is visible.
      assert.lengthOf(response.$('a:contains("Question 1")'), 1);
    });

    test.sequential('check that the assessment instance is closed', async () => {
      const results = await sqldb.queryRows(
        sql.select_assessment_instances,
        AssessmentInstanceSchema,
      );
      assert.equal(results.length, 1);
      assert.equal(results[0].open, false);
    });

    test.sequential('access question with existing variant when exam is closed', async () => {
      const response = await helperClient.fetchCheerio(context.examQuestionUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      // There should be no save or grade buttons
      assert.lengthOf(response.$('button.question-save'), 0);
      assert.lengthOf(response.$('button.question-grade'), 0);
    });

    test.sequential('access question without existing variant when exam is closed', async () => {
      const response = await helperClient.fetchCheerio(context.examQuestionWithoutVariantUrl, {
        headers,
      });
      assert.equal(response.status, 403);
      assert.lengthOf(response.$(`div.card-body:contains(${VARIANT_FORBIDDEN_STRING})`), 1);
    });

    test.sequential(
      'ensure that a link to the exam is visible on the assessments page if student has started the exam and active is false',
      async () => {
        headers.cookie = 'pl_test_date=2010-01-02T00:01:01Z';

        const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
        assert.isTrue(response.ok);

        assert.lengthOf(response.$('a:contains("Test Active Access Rule")'), 1);
      },
    );

    test.sequential('access the exam when it is no longer active', async () => {
      headers.cookie = 'pl_test_date=2010-01-10T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.examInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      const msg = response.$('p.small.mb-0');
      assert.lengthOf(msg, 1);
      assert.match(
        msg.text(),
        /Notes can't be added or deleted because the assessment is closed\./,
      );
    });

    test.sequential('access question with existing variant when exam is not active', async () => {
      const response = await helperClient.fetchCheerio(context.examQuestionUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      // There should be no save or grade buttons
      assert.lengthOf(response.$('button.question-save'), 0);
      assert.lengthOf(response.$('button.question-grade'), 0);
    });

    test.sequential(
      'access question without existing variant when exam is not active',
      async () => {
        const response = await helperClient.fetchCheerio(context.examQuestionWithoutVariantUrl, {
          headers,
        });
        assert.equal(response.status, 403);
        assert.lengthOf(response.$(`div.card-body:contains(${VARIANT_FORBIDDEN_STRING})`), 1);
      },
    );

    test.sequential('access clientFilesCourse when exam is not active', async () => {
      const response = await fetch(`${context.examUrl}clientFilesCourse/data.txt`, {
        headers,
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'This data is specific to the course.');
    });

    test.sequential('access clientFilesCourseInstance when exam is not active', async () => {
      const response = await fetch(`${context.examUrl}clientFilesCourseInstance/data.txt`, {
        headers,
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'This data is specific to the course instance.');
    });

    test.sequential('access clientFilesAssessment when exam is not active', async () => {
      const response = await fetch(`${context.examUrl}clientFilesAssessment/data.txt`, {
        headers,
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'This data is specific to the assessment.');
    });

    test.sequential('ensure that no new variants have been created', async () => {
      const countVariantsResult = await sqldb.queryRow(
        sql.count_variants,
        { assessment_instance_id: helperClient.parseAssessmentInstanceId(context.examInstanceUrl) },
        z.number(),
      );
      assert.equal(countVariantsResult, context.numberOfVariants);
    });

    test.sequential('access the exam when active and showClosedAssessment are false', async () => {
      headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.examInstanceUrl, { headers });
      assert.equal(response.status, 403);

      assert.lengthOf(response.$('[data-testid="assessment-closed-message"]'), 1);
      assert.lengthOf(response.$('div.progress'), 1); // score should be shown
    });

    test.sequential(
      'access a workspace when active and showClosedAssessment are false',
      async () => {
        const response = await helperClient.fetchCheerio(context.examWorkspaceUrl, { headers });
        assert.equal(response.status, 403);

        assert.lengthOf(response.$('[data-testid="assessment-closed-message"]'), 1);
        assert.lengthOf(response.$('div.progress'), 1); // score should be shown
      },
    );

    test.sequential(
      'access the exam when active, showClosedAssessment, and showClosedAssessmentScore are false',
      async () => {
        headers.cookie = 'pl_test_date=2030-06-01T00:00:01Z';

        const response = await helperClient.fetchCheerio(context.examInstanceUrl, { headers });
        assert.equal(response.status, 403);

        assert.lengthOf(response.$('[data-testid="assessment-closed-message"]'), 1);
        assert.lengthOf(response.$('div.progress'), 0); // score should NOT be shown
      },
    );

    test.sequential('try to access the homework when it is not active', async () => {
      headers.cookie = 'pl_test_date=2000-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwUrl, {
        headers,
      });
      assert.equal(response.status, 403);

      const msg = response.$('[data-testid="assessment-closed-message"]');
      assert.lengthOf(msg, 1);
      assert.match(msg.text(), /Assessment will become available on 2020-01-01 00:00:01/);
    });

    test.sequential('access the homework when it is active', async () => {
      headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      // We should have been redirected to the assessment instance
      const hwInstanceUrl = response.url;
      assert.include(hwInstanceUrl, '/assessment_instance/');
      context.hwInstanceUrl = hwInstanceUrl;

      // the link to the first question begins with "HWX.1." where X is the homework number
      const questionWithVariantPath = response
        .$(`a:contains(HW${context.hwNumber}.1.)`)
        .attr('href');
      const questionWithoutVariantPath = response
        .$(`a:contains(HW${context.hwNumber}.2.)`)
        .attr('href');
      context.hwQuestionUrl = `${context.siteUrl}${questionWithVariantPath}`;
      context.hwQuestionWithoutVariantUrl = `${context.siteUrl}${questionWithoutVariantPath}`;
    });

    test.sequential('access a question when homework is active', async () => {
      headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

      // Access the question to create a variant.
      const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      helperClient.extractAndSaveCSRFToken(context, response.$, '.question-form');
      helperClient.extractAndSaveVariantId(context, response.$, '.question-form');
    });

    test.sequential('count number of variants generated', async () => {
      context.numberOfVariants = await sqldb.queryRow(
        sql.count_variants,
        { assessment_instance_id: helperClient.parseAssessmentInstanceId(context.hwInstanceUrl) },
        z.number(),
      );
      assert.equal(context.numberOfVariants, 1);
    });

    test.sequential('access the homework when it is no longer active', async () => {
      headers.cookie = 'pl_test_date=2021-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      const msg = response.$('p.small.mb-0');
      assert.lengthOf(msg, 1);
      assert.match(
        msg.text(),
        /Notes can't be added or deleted because the assessment is closed\./,
      );
    });

    test.sequential(
      'access question with existing variant when homework is not active',
      async () => {
        const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
          headers,
        });
        assert.isTrue(response.ok);

        // There should be no save or grade buttons
        assert.lengthOf(response.$('button.question-save'), 0);
        assert.lengthOf(response.$('button.question-grade'), 0);
      },
    );

    test.sequential(
      'access question without existing variant when homework is not active',
      async () => {
        const response = await helperClient.fetchCheerio(context.hwQuestionWithoutVariantUrl, {
          headers,
        });
        assert.equal(response.status, 403);
        assert.lengthOf(response.$(`div.card-body:contains(${VARIANT_FORBIDDEN_STRING})`), 1);
      },
    );

    test.sequential('ensure that no new variants have been created', async () => {
      const countVariantsResult = await sqldb.queryRow(
        sql.count_variants,
        { assessment_instance_id: helperClient.parseAssessmentInstanceId(context.hwInstanceUrl) },
        z.number(),
      );
      assert.equal(countVariantsResult, context.numberOfVariants);
    });

    test.sequential(
      'access the homework when active and showClosedAssessment are false, but the homework will be active later',
      async () => {
        headers.cookie = 'pl_test_date=2026-06-01T00:00:01Z';

        const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
          headers,
        });
        assert.equal(response.status, 403);

        const msg = response.$('[data-testid="assessment-closed-message"]');
        assert.lengthOf(msg, 1);
        assert.match(msg.text(), /Assessment will become available on 2030-01-01 00:00:01/);

        assert.lengthOf(response.$('div.progress'), 1); // score should be shown
      },
    );

    test.sequential(
      'access the homework when an active and a non-active access rule are both satisfied, and both have nonzero credit',
      async () => {
        headers.cookie = 'pl_test_date=2030-06-01T00:00:01Z';

        const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
          headers,
        });
        assert.isTrue(response.ok);
      },
    );

    test.sequential(
      'access the homework when active and showClosedAssessment are false, and the homework will never be active again',
      async () => {
        headers.cookie = 'pl_test_date=2036-06-01T00:00:01Z';

        const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
          headers,
        });
        assert.equal(response.status, 403);

        const msg = response.$('[data-testid="assessment-closed-message"]');
        assert.lengthOf(msg, 1);
        assert.match(msg.text(), /Assessment is no longer available\./);

        assert.lengthOf(response.$('div.progress'), 1); // score should be shown
      },
    );

    test.sequential('submit an answer to a question when active is false', async () => {
      headers.cookie = 'pl_test_date=2021-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token: context.__csrf_token,
          __variant_id: context.__variant_id,
          s: '75', // To get 75% of the question
        }),
        headers,
      });
      assert.equal(response.status, 400);
    });

    test.sequential(
      'check that no credit is received for an answer submitted when active is false',
      async () => {
        const points = await sqldb.queryRow(
          sql.read_assessment_instance_points,
          { assessment_id: context.hwId },
          z.number(),
        );
        assert.equal(points, 0);
      },
    );

    test.sequential(
      'get CSRF token and variant ID for attaching file on question page',
      async () => {
        headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

        const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
          headers,
        });
        assert.isTrue(response.ok);

        helperClient.extractAndSaveCSRFToken(context, response.$, '.attach-file-form');
        helperClient.extractAndSaveVariantId(context, response.$, '.attach-file-form');
      },
    );

    test.sequential('try to attach a file to a question when active is false', async () => {
      headers.cookie = 'pl_test_date=2021-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'attach_file',
          __csrf_token: context.__csrf_token,
          __variant_id: context.__variant_id,
          filename: 'testfile.txt',
          contents: 'This is the test text',
        }),
        headers,
      });
      assert.equal(response.status, 403);
    });

    test.sequential('get CSRF token for attaching file on assessment instance page', async () => {
      headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      helperClient.extractAndSaveCSRFToken(context, response.$, '.attach-file-form');
    });

    test.sequential('try to attach a file to the assessment when active is false', async () => {
      headers.cookie = 'pl_test_date=2021-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'attach_file',
          __csrf_token: context.__csrf_token,
          __variant_id: context.__variant_id,
          filename: 'testfile.txt',
          contents: 'This is the test text',
        }),
        headers,
      });
      assert.equal(response.status, 403);
    });

    test.sequential(
      'get CSRF token and variant ID for attaching text on question page',
      async () => {
        headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

        const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
          headers,
        });
        assert.isTrue(response.ok);

        helperClient.extractAndSaveCSRFToken(context, response.$, '.attach-text-form');
        helperClient.extractAndSaveVariantId(context, response.$, '.attach-text-form');
      },
    );

    test.sequential('try to attach text to a question when active is false', async () => {
      headers.cookie = 'pl_test_date=2021-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'attach_text',
          __csrf_token: context.__csrf_token,
          __variant_id: context.__variant_id,
          filename: 'testfile.txt',
          contents: 'This is the test text',
        }),
        headers,
      });
      assert.equal(response.status, 403);
    });

    test.sequential('get CSRF token for attaching text on assessment instance page', async () => {
      headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      helperClient.extractAndSaveCSRFToken(context, response.$, '.attach-text-form');
    });

    test.sequential('try to attach text to the assessment when active is false', async () => {
      headers.cookie = 'pl_test_date=2021-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'attach_text',
          __csrf_token: context.__csrf_token,
          __variant_id: context.__variant_id,
          filename: 'testfile.txt',
          contents: 'This is the test text',
        }),
        headers,
      });
      assert.equal(response.status, 403);
    });

    test.sequential('check that no files or text were attached', async () => {
      const numberOfFiles = await sqldb.queryRow(
        sql.get_attached_files,
        { assessment_id: context.hwId },
        z.number(),
      );

      // Note: inserting text is really inserting a file in disguise, so we just need to check
      // that the files table is empty.
      assert.equal(numberOfFiles, 0);
    });
  },
);
