import { assert } from 'chai';
import { step } from 'mocha-steps';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';

import { config } from '../lib/config.js';
import { IdSchema, AssessmentInstanceSchema } from '../lib/db-types.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

describe('Exam and homework assessment with active access restriction', function () {
  this.timeout(60000);

  const storedConfig: Record<string, any> = {};
  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;
  context.assessmentListUrl = `${context.courseInstanceBaseUrl}/assessments`;
  context.gradeBookUrl = `${context.courseInstanceBaseUrl}/gradebook`;

  const headers: Record<string, string> = {};

  const VARIANT_FORBIDDEN_STRING = 'This question was not viewed while the assessment was open';

  before('set authenticated user', function (callback) {
    storedConfig.authUid = config.authUid;
    storedConfig.authName = config.authName;
    storedConfig.authUin = config.authUin;
    config.authUid = 'student@example.com';
    config.authName = 'Student User';
    config.authUin = '00000001';
    callback(null);
  });
  before('set up testing server', async function () {
    await helperServer.before().call(this);
    context.examId = await sqldb.queryRow(sql.select_exam11, IdSchema);
    context.examUrl = `${context.courseInstanceBaseUrl}/assessment/${context.examId}/`;

    context.hwId = await sqldb.queryRow(sql.select_homework8, IdSchema);
    context.hwUrl = `${context.courseInstanceBaseUrl}/assessment/${context.hwId}/`;
    context.hwNumber = '8';
  });
  after('shut down testing server', helperServer.after);
  after('unset authenticated user', function (callback) {
    Object.assign(config, storedConfig);
    callback(null);
  });

  step('visit home page', async () => {
    const response = await helperClient.fetchCheerio(context.baseUrl, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step('enroll the test student user in the course', async () => {
    await sqldb.queryOneRowAsync(sql.enroll_student_in_course, []);
  });

  step(
    'ensure that the exam is not visible on the assessments page when no access rule applies',
    async () => {
      headers.cookie = 'pl_test_date=1850-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
      assert.isTrue(response.ok);

      assert.lengthOf(response.$('a:contains("Test Active Access Rule")'), 0);
    },
  );

  step('try to access the exam when no access rule applies', async () => {
    headers.cookie = 'pl_test_date=1850-06-01T00:00:01Z';

    const response = await helperClient.fetchCheerio(context.examUrl, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step(
    'ensure that the exam is visible without a link on the assessments page if student has not started the exam and active is false',
    async () => {
      headers.cookie = 'pl_test_date=2000-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
      assert.isTrue(response.ok);

      assert.lengthOf(response.$('td:contains("Test Active Access Rule")'), 1);
      assert.lengthOf(response.$('a:contains("Test Active Access Rule")'), 0); // there should be no link
    },
  );

  step('try to access the exam when it is not active', async () => {
    headers.cookie = 'pl_test_date=2000-06-01T00:00:01Z';

    const response = await helperClient.fetchCheerio(context.examUrl, {
      headers,
    });
    assert.equal(response.status, 403);

    const msg = response.$('div.test-suite-assessment-closed-message');
    assert.lengthOf(msg, 1);
    assert.match(msg.text(), /Assessment will become available on 2010-01-01 00:00:01/);
  });

  step('check that an assessment instance was not created', async () => {
    const results = await sqldb.queryRows(
      sql.select_assessment_instances,
      AssessmentInstanceSchema,
    );
    assert.equal(results.length, 0);
  });

  step(
    'ensure that a link to the exam is visible on the assessments page if active is true',
    async () => {
      headers.cookie = 'pl_test_date=2010-01-01T23:50:01Z';

      const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
      assert.isTrue(response.ok);

      assert.lengthOf(response.$('a:contains("Test Active Access Rule")'), 1);
    },
  );

  step('visit start exam page when the exam is active', async () => {
    headers.cookie = 'pl_test_date=2010-01-01T23:50:01Z';

    const response = await helperClient.fetchCheerio(context.examUrl, {
      headers,
    });
    assert.isTrue(response.ok);

    assert.equal(response.$('#start-assessment').text().trim(), 'Start assessment');

    helperClient.extractAndSaveCSRFToken(context, response.$, 'form');
  });

  step('start the exam and access a question', async () => {
    const form = {
      __action: 'new_instance',
      __csrf_token: context.__csrf_token,
    };
    const response = await helperClient.fetchCheerio(context.examUrl, {
      method: 'POST',
      form,
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
    context.examQuestionUrl = `${context.siteUrl}${questionWithVariantPath}`;
    context.examQuestionWithoutVariantUrl = `${context.siteUrl}${questionWithoutVariantPath}`;

    const questionResponse = await helperClient.fetchCheerio(context.examQuestionUrl, {
      headers,
    });
    assert.isTrue(questionResponse.ok);
  });

  step('count number of variants generated', async () => {
    context.numberOfVariants = await sqldb.queryRow(
      sql.count_variants,
      {
        assessment_instance_id: helperClient.parseAssessmentInstanceId(context.examInstanceUrl),
      },
      z.number(),
    );
    assert.equal(context.numberOfVariants, 1);
  });

  step('simulate a time limit expiration', async () => {
    const form = {
      __action: 'timeLimitFinish',
      __csrf_token: context.__csrf_token,
    };
    const response = await helperClient.fetchCheerio(context.examInstanceUrl, {
      method: 'POST',
      form,
      headers,
    });

    // At this time, showClosedAssessment is true, so the status of the HTTP response should be 200
    assert.isTrue(response.ok);

    // We should have been redirected back to the same assessment instance
    assert.equal(response.url, `${context.examInstanceUrl}?timeLimitExpired=true`);

    // Since showClosedAssessment is true, Question 1 is visible.
    assert.lengthOf(response.$('a:contains("Question 1")'), 1);
  });

  step('check that the assessment instance is closed', async () => {
    const results = await sqldb.queryRows(
      sql.select_assessment_instances,
      AssessmentInstanceSchema,
    );
    assert.equal(results.length, 1);
    assert.equal(results[0].open, false);
  });

  step('access question with existing variant when exam is closed', async () => {
    const response = await helperClient.fetchCheerio(context.examQuestionUrl, {
      headers,
    });
    assert.isTrue(response.ok);

    // There should be no save or grade buttons
    assert.lengthOf(response.$('button.question-save'), 0);
    assert.lengthOf(response.$('button.question-grade'), 0);
  });

  step('access question without existing variant when exam is closed', async () => {
    const response = await helperClient.fetchCheerio(context.examQuestionWithoutVariantUrl, {
      headers,
    });
    assert.equal(response.status, 403);
    assert.lengthOf(response.$(`div.card-body:contains(${VARIANT_FORBIDDEN_STRING})`), 1);
  });

  step(
    'ensure that a link to the exam is visible on the assessments page if student has started the exam and active is false',
    async () => {
      headers.cookie = 'pl_test_date=2010-01-02T00:01:01Z';

      const response = await helperClient.fetchCheerio(context.assessmentListUrl, { headers });
      assert.isTrue(response.ok);

      assert.lengthOf(response.$('a:contains("Test Active Access Rule")'), 1);
    },
  );

  step('access the exam when it is no longer active', async () => {
    headers.cookie = 'pl_test_date=2010-01-02T00:01:01Z';

    const response = await helperClient.fetchCheerio(context.examInstanceUrl, {
      headers,
    });
    assert.isTrue(response.ok);

    const msg = response.$('p.small.mb-0');
    assert.lengthOf(msg, 1);
    assert.match(msg.text(), /Notes can't be added or deleted because the assessment is closed\./);
  });

  step('access question with existing variant when exam is not active', async () => {
    const response = await helperClient.fetchCheerio(context.examQuestionUrl, {
      headers,
    });
    assert.isTrue(response.ok);

    // There should be no save or grade buttons
    assert.lengthOf(response.$('button.question-save'), 0);
    assert.lengthOf(response.$('button.question-grade'), 0);
  });

  step('access question without existing variant when exam is not active', async () => {
    const response = await helperClient.fetchCheerio(context.examQuestionWithoutVariantUrl, {
      headers,
    });
    assert.equal(response.status, 403);
    assert.lengthOf(response.$(`div.card-body:contains(${VARIANT_FORBIDDEN_STRING})`), 1);
  });

  step('ensure that no new variants have been created', async () => {
    const countVariantsResult = await sqldb.queryRow(
      sql.count_variants,
      {
        assessment_instance_id: helperClient.parseAssessmentInstanceId(context.examInstanceUrl),
      },
      z.number(),
    );
    assert.equal(countVariantsResult, context.numberOfVariants);
  });

  step('access the exam when active and showClosedAssessment are false', async () => {
    headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

    const response = await helperClient.fetchCheerio(context.examInstanceUrl, { headers });
    assert.equal(response.status, 403);

    assert.lengthOf(response.$('div.test-suite-assessment-closed-message'), 1);
    assert.lengthOf(response.$('div.progress'), 1); // score should be shown
  });

  step(
    'access the exam when active, showClosedAssessment, and showClosedAssessmentScore are false',
    async () => {
      headers.cookie = 'pl_test_date=2030-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.examInstanceUrl, { headers });
      assert.equal(response.status, 403);

      assert.lengthOf(response.$('div.test-suite-assessment-closed-message'), 1);
      assert.lengthOf(response.$('div.progress'), 0); // score should NOT be shown
    },
  );

  step('try to access the homework when it is not active', async () => {
    headers.cookie = 'pl_test_date=2000-06-01T00:00:01Z';

    const response = await helperClient.fetchCheerio(context.hwUrl, {
      headers,
    });
    assert.equal(response.status, 403);

    const msg = response.$('div.test-suite-assessment-closed-message');
    assert.lengthOf(msg, 1);
    assert.match(msg.text(), /Assessment will become available on 2020-01-01 00:00:01/);
  });

  step('access the homework when it is active', async () => {
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
    const questionWithVariantPath = response.$(`a:contains(HW${context.hwNumber}.1.)`).attr('href');
    const questionWithoutVariantPath = response
      .$(`a:contains(HW${context.hwNumber}.2.)`)
      .attr('href');
    context.hwQuestionUrl = `${context.siteUrl}${questionWithVariantPath}`;
    context.hwQuestionWithoutVariantUrl = `${context.siteUrl}${questionWithoutVariantPath}`;
  });

  step('access a question when homework is active', async () => {
    headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

    const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
      headers,
    });
    assert.isTrue(response.ok);

    helperClient.extractAndSaveCSRFToken(context, response.$, '.question-form');
    helperClient.extractAndSaveVariantId(context, response.$, '.question-form');
  });

  step('count number of variants generated', async () => {
    context.numberOfVariants = await sqldb.queryRow(
      sql.count_variants,
      {
        assessment_instance_id: helperClient.parseAssessmentInstanceId(context.hwInstanceUrl),
      },
      z.number(),
    );
    assert.equal(context.numberOfVariants, 1);
  });

  step('access the homework when it is no longer active', async () => {
    headers.cookie = 'pl_test_date=2021-06-01T00:00:01Z';

    const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
      headers,
    });
    assert.isTrue(response.ok);

    const msg = response.$('p.small.mb-0');
    assert.lengthOf(msg, 1);
    assert.match(msg.text(), /Notes can't be added or deleted because the assessment is closed\./);
  });

  step('access question with existing variant when homework is not active', async () => {
    const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
      headers,
    });
    assert.isTrue(response.ok);

    // There should be no save or grade buttons
    assert.lengthOf(response.$('button.question-save'), 0);
    assert.lengthOf(response.$('button.question-grade'), 0);
  });

  step('access question without existing variant when homework is not active', async () => {
    const response = await helperClient.fetchCheerio(context.hwQuestionWithoutVariantUrl, {
      headers,
    });
    assert.equal(response.status, 403);
    assert.lengthOf(response.$(`div.card-body:contains(${VARIANT_FORBIDDEN_STRING})`), 1);
  });

  step('ensure that no new variants have been created', async () => {
    const countVariantsResult = await sqldb.queryRow(
      sql.count_variants,
      {
        assessment_instance_id: helperClient.parseAssessmentInstanceId(context.examInstanceUrl),
      },
      z.number(),
    );
    assert.equal(countVariantsResult, context.numberOfVariants);
  });

  step(
    'access the homework when active and showClosedAssessment are false, but the homework will be active later',
    async () => {
      headers.cookie = 'pl_test_date=2026-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
        headers,
      });
      assert.equal(response.status, 403);

      const msg = response.$('div.test-suite-assessment-closed-message');
      assert.lengthOf(msg, 1);
      assert.match(msg.text(), /Assessment will become available on 2030-01-01 00:00:01/);

      assert.lengthOf(response.$('div.progress'), 1); // score should be shown
    },
  );

  step(
    'access the homework when an active and a non-active access rule are both satisfied, and both have nonzero credit',
    async () => {
      headers.cookie = 'pl_test_date=2030-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
    },
  );

  step(
    'access the homework when active and showClosedAssessment are false, and the homework will never be active again',
    async () => {
      headers.cookie = 'pl_test_date=2036-06-01T00:00:01Z';

      const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
        headers,
      });
      assert.equal(response.status, 403);

      const msg = response.$('div.test-suite-assessment-closed-message');
      assert.lengthOf(msg, 1);
      assert.match(msg.text(), /Assessment is no longer available\./);

      assert.lengthOf(response.$('div.progress'), 1); // score should be shown
    },
  );

  step('submit an answer to a question when active is false', async () => {
    headers.cookie = 'pl_test_date=2021-06-01T00:00:01Z';

    const form = {
      __action: 'grade',
      __csrf_token: context.__csrf_token,
      __variant_id: context.__variant_id,
      s: '75', // To get 75% of the question
    };

    const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.equal(response.status, 400);
  });

  step(
    'check that no credit is received for an answer submitted when active is false',
    async () => {
      const points = await sqldb.queryRow(
        sql.read_assessment_instance_points,
        {
          assessment_id: context.hwId,
        },
        z.number(),
      );
      assert.equal(points, 0);
    },
  );

  step('get CSRF token and variant ID for attaching file on question page', async () => {
    headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

    const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
      headers,
    });
    assert.isTrue(response.ok);

    helperClient.extractAndSaveCSRFToken(context, response.$, '.attach-file-form');
    helperClient.extractAndSaveVariantId(context, response.$, '.attach-file-form');
  });

  step('try to attach a file to a question when active is false', async () => {
    headers.cookie = 'pl_test_date=2021-06-01T00:00:01Z';

    const form = {
      __action: 'attach_file',
      __csrf_token: context.__csrf_token,
      __variant_id: context.__variant_id,
      filename: 'testfile.txt',
      contents: 'This is the test text',
    };

    const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('get CSRF token for attaching file on assessment instance page', async () => {
    headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

    const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
      headers,
    });
    assert.isTrue(response.ok);

    helperClient.extractAndSaveCSRFToken(context, response.$, '.attach-file-form');
  });

  step('try to attach a file to the assessment when active is false', async () => {
    headers.cookie = 'pl_test_date=2021-06-01T00:00:01Z';

    const form = {
      __action: 'attach_file',
      __csrf_token: context.__csrf_token,
      __variant_id: context.__variant_id,
      filename: 'testfile.txt',
      contents: 'This is the test text',
    };

    const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('get CSRF token and variant ID for attaching text on question page', async () => {
    headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

    const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
      headers,
    });
    assert.isTrue(response.ok);

    helperClient.extractAndSaveCSRFToken(context, response.$, '.attach-text-form');
    helperClient.extractAndSaveVariantId(context, response.$, '.attach-text-form');
  });

  step('try to attach text to a question when active is false', async () => {
    headers.cookie = 'pl_test_date=2021-06-01T00:00:01Z';

    const form = {
      __action: 'attach_text',
      __csrf_token: context.__csrf_token,
      __variant_id: context.__variant_id,
      filename: 'testfile.txt',
      contents: 'This is the test text',
    };

    const response = await helperClient.fetchCheerio(context.hwQuestionUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('get CSRF token for attaching text on assessment instance page', async () => {
    headers.cookie = 'pl_test_date=2020-06-01T00:00:01Z';

    const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
      headers,
    });
    assert.isTrue(response.ok);

    helperClient.extractAndSaveCSRFToken(context, response.$, '.attach-text-form');
  });

  step('try to attach text to the assessment when active is false', async () => {
    headers.cookie = 'pl_test_date=2021-06-01T00:00:01Z';

    const form = {
      __action: 'attach_text',
      __csrf_token: context.__csrf_token,
      __variant_id: context.__variant_id,
      filename: 'testfile.txt',
      contents: 'This is the test text',
    };

    const response = await helperClient.fetchCheerio(context.hwInstanceUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('check that no files or text were attached', async () => {
    const numberOfFiles = await sqldb.queryRow(
      sql.get_attached_files,
      {
        assessment_id: context.hwId,
      },
      z.number(),
    );

    // Note: inserting text is really inserting a file in disguise, so we just need to check
    // that the files table is empty.
    assert.equal(numberOfFiles, 0);
  });
});
