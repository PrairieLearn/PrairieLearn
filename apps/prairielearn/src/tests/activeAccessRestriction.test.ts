import { afterAll, assert, beforeAll, describe, test } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import { AssessmentInstanceSchema } from '../lib/db-types.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { ensureUncheckedEnrollment } from '../models/enrollment.js';
import { selectUserByUid } from '../models/user.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

// The exam (exam11-activeAccessRestriction) has:
//   release 2010-01-01, due 2010-01-01T23:59:59, durationMinutes 50,
//   afterComplete questions/score hidden until 2020-01-01,
//   beforeRelease.listed true.
//
// The homework (hw8-activeAccessRestriction) has:
//   release 2020-01-01, due 2020-12-31, late deadline 2030-12-31 at 75% credit,
//   afterComplete questions hidden except between 2040-01-01 and 2049-12-31,
//   beforeRelease.listed true.
describe(
  'Exam and homework assessment with date control and after-complete restrictions',
  { timeout: 60_000, concurrent: false },
  function () {
    const storedConfig: Record<string, any> = {};
    const context: Record<string, any> = { siteUrl: `http://localhost:${config.serverPort}` };
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

    test('visit home page', async () => {
      const response = await helperClient.fetchCheerio(context.baseUrl, {
        headers,
      });
      assert.isTrue(response.ok);
    });

    test('enroll the test student user in the course', async () => {
      const user = await selectUserByUid('student@example.com');
      const courseInstance = await selectCourseInstanceById('1');
      await ensureUncheckedEnrollment({
        userId: user.id,
        courseInstance,
        requiredRole: ['System'],
        authzData: dangerousFullSystemAuthz(),
        actionDetail: 'implicit_joined',
      });
    });

    test('ensure that the exam is visible without a link on the assessments page before it is released', async () => {
      headers.cookie = 'pl_test_date=2000-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
      assert.isTrue(response.ok);

      assert.lengthOf(response.$('td:contains("Test Active Access Rule")'), 1);
      assert.lengthOf(response.$('a:contains("Test Active Access Rule")'), 0); // there should be no link
    });

    test('try to access the exam before it is released', async () => {
      headers.cookie = 'pl_test_date=2000-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.examUrl, {
        headers,
      });
      assert.equal(response.status, 403);

      const cardBodyText = response.$('.card-body').text();
      assert.include(
        cardBodyText,
        "This assessment's configuration does not allow you to access it right now.",
      );
    });

    test('check that an assessment instance was not created', async () => {
      const results = await sqldb.queryRows(
        sql.select_assessment_instances,
        AssessmentInstanceSchema,
      );
      assert.equal(results.length, 0);
    });

    test('ensure that a link to the exam is visible on the assessments page during the access window', async () => {
      headers.cookie = 'pl_test_date=2010-01-01T23:50:01Z';

      const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
      assert.isTrue(response.ok);

      assert.lengthOf(response.$('a:contains("Test Active Access Rule")'), 1);
    });

    test('visit start exam page during the access window', async () => {
      headers.cookie = 'pl_test_date=2010-01-01T23:50:01Z';

      const response = await helperClient.fetchCheerio(context.examUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      assert.equal(response.$('#start-assessment').text().trim(), 'Start assessment');

      helperClient.extractAndSaveCSRFToken(context, response.$, 'form');
    });

    test('start the exam and access questions', async () => {
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
      const questionWithWorkspace = response.$('a:contains("Question 6")').attr('href');
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

    test('count number of variants generated', async () => {
      context.numberOfVariants = await sqldb.queryScalar(
        sql.count_variants,
        { assessment_instance_id: helperClient.parseAssessmentInstanceId(context.examInstanceUrl) },
        z.number(),
      );
      assert.equal(context.numberOfVariants, 2);
    });

    test('access the exam after the time limit has expired', async () => {
      // The exam was started at 23:50 with a 50-minute duration, so the time
      // limit has expired one hour later. Questions and score are hidden
      // after completion until 2020-01-01.
      headers.cookie = 'pl_test_date=2010-01-02T00:50:01Z';

      const response = await helperClient.fetchCheerio(context.examInstanceUrl, { headers });
      assert.equal(response.status, 403);

      const msg = response.$('[data-testid="assessment-closed-message"]');
      assert.lengthOf(msg, 1);
      assert.match(msg.text(), /Assessment is no longer available\./);

      assert.lengthOf(response.$('div.progress'), 0); // score should NOT be shown
    });

    test('a timeLimitFinish POST closes the assessment after the time limit has expired', async () => {
      const response = await helperClient.fetchCheerio(context.examInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'timeLimitFinish',
          __csrf_token: context.__csrf_token,
        }),
        headers,
      });
      assert.equal(response.status, 403);
      assert.equal(response.url, `${context.examInstanceUrl}?timeLimitExpired=true`);
    });

    test('check that the assessment instance is closed', async () => {
      const results = await sqldb.queryRows(
        sql.select_assessment_instances,
        AssessmentInstanceSchema,
      );
      assert.equal(results.length, 1);
      assert.equal(results[0].open, false);
    });

    test('ensure that a link to the exam is visible on the assessments page after the student has started the exam', async () => {
      headers.cookie = 'pl_test_date=2010-01-02T00:50:01Z';

      const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
      assert.isTrue(response.ok);

      assert.lengthOf(response.$('a:contains("Test Active Access Rule")'), 1);
    });

    test('access a question with an existing variant while questions are hidden', async () => {
      const response = await helperClient.fetchCheerio(context.examQuestionUrl, {
        headers,
      });
      assert.equal(response.status, 403);

      assert.lengthOf(response.$('[data-testid="assessment-closed-message"]'), 1);
    });

    test('access a workspace while questions are hidden', async () => {
      const response = await helperClient.fetchCheerio(context.examWorkspaceUrl, { headers });
      assert.equal(response.status, 403);

      assert.lengthOf(response.$('[data-testid="assessment-closed-message"]'), 1);
    });

    test('access the exam instance once questions become visible after completion', async () => {
      headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

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

    test('access a question with an existing variant during the review window', async () => {
      const response = await helperClient.fetchCheerio(context.examQuestionUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      // There should be no save or grade buttons
      assert.lengthOf(response.$('button.question-save'), 0);
      assert.lengthOf(response.$('button.question-grade'), 0);
    });

    test('access a question without an existing variant during the review window', async () => {
      const response = await helperClient.fetchCheerio(context.examQuestionWithoutVariantUrl, {
        headers,
      });
      assert.equal(response.status, 403);
      assert.lengthOf(response.$(`div.card-body:contains(${VARIANT_FORBIDDEN_STRING})`), 1);
    });

    test('access clientFilesCourse during the review window', async () => {
      const response = await fetch(`${context.examUrl}clientFilesCourse/data.txt`, {
        headers,
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'This data is specific to the course.');
    });

    test('access clientFilesCourseInstance during the review window', async () => {
      const response = await fetch(`${context.examUrl}clientFilesCourseInstance/data.txt`, {
        headers,
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'This data is specific to the course instance.');
    });

    test('access clientFilesAssessment during the review window', async () => {
      const response = await fetch(`${context.examUrl}clientFilesAssessment/data.txt`, {
        headers,
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'This data is specific to the assessment.');
    });

    test('ensure that no new variants have been created', async () => {
      const countVariantsResult = await sqldb.queryScalar(
        sql.count_variants,
        { assessment_instance_id: helperClient.parseAssessmentInstanceId(context.examInstanceUrl) },
        z.number(),
      );
      assert.equal(countVariantsResult, context.numberOfVariants);
    });

    test('try to access the homework before it is released', async () => {
      headers.cookie = 'pl_test_date=2000-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwUrl, {
        headers,
      });
      assert.equal(response.status, 403);

      const cardBodyText = response.$('.card-body').text();
      assert.include(
        cardBodyText,
        "This assessment's configuration does not allow you to access it right now.",
      );
    });

    test('access the homework during the access window', async () => {
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

    test('access a question during the access window', async () => {
      headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

      // Access the question to create a variant.
      const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      helperClient.extractAndSaveCSRFToken(context, response.$, '.question-form');
      helperClient.extractAndSaveVariantId(context, response.$, '.question-form');
    });

    test('count number of variants generated', async () => {
      context.numberOfVariants = await sqldb.queryScalar(
        sql.count_variants,
        { assessment_instance_id: helperClient.parseAssessmentInstanceId(context.hwInstanceUrl) },
        z.number(),
      );
      assert.equal(context.numberOfVariants, 1);
    });

    test('access the homework during the after-complete review window', async () => {
      headers.cookie = 'pl_test_date=2041-06-01T00:00:01Z';

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

    test('access a question with an existing variant during the review window', async () => {
      const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      // There should be no save or grade buttons
      assert.lengthOf(response.$('button.question-save'), 0);
      assert.lengthOf(response.$('button.question-grade'), 0);
    });

    test('access a question without an existing variant during the review window', async () => {
      const response = await helperClient.fetchCheerio(context.hwQuestionWithoutVariantUrl, {
        headers,
      });
      assert.equal(response.status, 403);
      assert.lengthOf(response.$(`div.card-body:contains(${VARIANT_FORBIDDEN_STRING})`), 1);
    });

    test('ensure that no new variants have been created', async () => {
      const countVariantsResult = await sqldb.queryScalar(
        sql.count_variants,
        { assessment_instance_id: helperClient.parseAssessmentInstanceId(context.hwInstanceUrl) },
        z.number(),
      );
      assert.equal(countVariantsResult, context.numberOfVariants);
    });

    test('access the homework during the late 75% credit window', async () => {
      headers.cookie = 'pl_test_date=2026-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      assert.match(response.$('body').text(), /Available credit:\s+75%/);
    });

    test('access the homework when it is complete and questions are hidden', async () => {
      headers.cookie = 'pl_test_date=2036-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
        headers,
      });
      assert.equal(response.status, 403);

      const msg = response.$('[data-testid="assessment-closed-message"]');
      assert.lengthOf(msg, 1);
      assert.match(msg.text(), /Assessment is no longer available\./);

      assert.lengthOf(response.$('div.progress'), 1); // score should be shown
    });

    test('access the homework after the after-complete review window has ended', async () => {
      headers.cookie = 'pl_test_date=2050-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
        headers,
      });
      assert.equal(response.status, 403);

      const msg = response.$('[data-testid="assessment-closed-message"]');
      assert.lengthOf(msg, 1);
      assert.match(msg.text(), /Assessment is no longer available\./);

      assert.lengthOf(response.$('div.progress'), 1); // score should be shown
    });

    test('submit an answer to a question during the review window', async () => {
      headers.cookie = 'pl_test_date=2041-06-01T00:00:01Z';

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

    test('check that no credit is received for an answer submitted during the review window', async () => {
      const points = await sqldb.queryScalar(
        sql.read_assessment_instance_points,
        { assessment_id: context.hwId },
        z.number(),
      );
      assert.equal(points, 0);
    });

    test('get CSRF token and variant ID for attaching file on question page', async () => {
      headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      helperClient.extractAndSaveCSRFToken(context, response.$, '.attach-file-form');
      helperClient.extractAndSaveVariantId(context, response.$, '.attach-file-form');
    });

    test('try to attach a file to a question during the review window', async () => {
      headers.cookie = 'pl_test_date=2041-06-01T00:00:01Z';

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

    test('get CSRF token for attaching file on assessment instance page', async () => {
      headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      helperClient.extractAndSaveCSRFToken(context, response.$, '.attach-file-form');
    });

    test('try to attach a file to the assessment during the review window', async () => {
      headers.cookie = 'pl_test_date=2041-06-01T00:00:01Z';

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

    test('get CSRF token and variant ID for attaching text on question page', async () => {
      headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      helperClient.extractAndSaveCSRFToken(context, response.$, '.attach-text-form');
      helperClient.extractAndSaveVariantId(context, response.$, '.attach-text-form');
    });

    test('try to attach text to a question during the review window', async () => {
      headers.cookie = 'pl_test_date=2041-06-01T00:00:01Z';

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

    test('get CSRF token for attaching text on assessment instance page', async () => {
      headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);

      helperClient.extractAndSaveCSRFToken(context, response.$, '.attach-text-form');
    });

    test('try to attach text to the assessment during the review window', async () => {
      headers.cookie = 'pl_test_date=2041-06-01T00:00:01Z';

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

    test('check that no files or text were attached', async () => {
      const numberOfFiles = await sqldb.queryScalar(
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
