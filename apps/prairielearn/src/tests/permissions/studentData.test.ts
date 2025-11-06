import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';

import { dangerousFullSystemAuthz } from '../../lib/authz-data-lib.js';
import { config } from '../../lib/config.js';
import {
  InstanceQuestionSchema,
  SprocUsersSelectOrInsertSchema,
  VariantSchema,
} from '../../lib/db-types.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectCourseInstanceById } from '../../models/course-instances.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  updateCourseInstancePermissionsRole,
} from '../../models/course-permissions.js';
import { ensureEnrollment } from '../../models/enrollment.js';
import * as helperClient from '../helperClient.js';
import * as helperServer from '../helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

describe('student data access', { timeout: 60_000 }, function () {
  const context: Record<string, any> = { siteUrl: `http://localhost:${config.serverPort}` };
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;
  context.userIdInstructor = 2;
  context.userIdStudent = 2;

  beforeAll(async function () {
    await helperServer.before()();
    const { id: homeworkAssessmentId } = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'hw1-automaticTestSuite',
    });
    context.homeworkAssessmentId = homeworkAssessmentId;
    context.homeworkAssessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.homeworkAssessmentId}/`;
    const { id: examAssessmentId } = await selectAssessmentByTid({
      course_instance_id: '1',
      tid: 'exam1-automaticTestSuite',
    });
    context.examAssessmentId = examAssessmentId;
    context.examAssessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.examAssessmentId}/`;
  });

  beforeAll(async function () {
    await sqldb.callRow(
      'users_select_or_insert',
      ['instructor@example.com', 'Instructor User', '100000000', 'instructor@example.com', 'dev'],
      SprocUsersSelectOrInsertSchema,
    );
    await sqldb.callRow(
      'users_select_or_insert',
      ['student@example.com', 'Student User', '000000001', 'student@example.com', 'dev'],
      SprocUsersSelectOrInsertSchema,
    );
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'instructor@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    const courseInstance = await selectCourseInstanceById('1');

    await ensureEnrollment({
      userId: '3',
      courseInstance,
      requestedRole: 'System',
      authzData: dangerousFullSystemAuthz(),
      actionDetail: 'implicit_joined',
    });
  });

  afterAll(helperServer.after);

  test.sequential('student can start HW1', async () => {
    const headers = { cookie: 'pl_test_user=test_student' };
    const response = await helperClient.fetchCheerio(context.homeworkAssessmentUrl, { headers });
    assert.isTrue(response.ok);
    const assessmentInstanceUrl = response.url;
    assert.include(assessmentInstanceUrl, '/assessment_instance/');
    context.homeworkAssessmentInstanceUrl = assessmentInstanceUrl;
    const questionUrl = response.$('a:contains("Add two numbers")').attr('href');
    context.homeworkQuestionInstanceUrl = `${context.siteUrl}${questionUrl}`;
  });

  test.sequential('student can access HW1/Q1', async () => {
    const headers = { cookie: 'pl_test_user=test_student' };
    const response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    context.homeworkQuestionVariant = await sqldb.queryRow(
      sql.select_variant,
      { assessment_id: context.homeworkAssessmentId },
      VariantSchema,
    );
  });

  test.sequential('student can access E1 in exam mode', async () => {
    const headers = { cookie: 'pl_test_user=test_student; pl_test_mode=Exam' };
    const response = await helperClient.fetchCheerio(context.examAssessmentUrl, { headers });
    assert.isTrue(response.ok);
    assert.equal(response.$('#start-assessment').text().trim(), 'Start assessment');
    helperClient.extractAndSaveCSRFToken(context, response.$, 'form');
  });

  test.sequential('student can start E1 in exam mode', async () => {
    const headers = { cookie: 'pl_test_user=test_student; pl_test_mode=Exam' };
    const response = await helperClient.fetchCheerio(context.examAssessmentUrl, {
      method: 'POST',
      body: new URLSearchParams({
        __action: 'new_instance',
        __csrf_token: context.__csrf_token,
      }),
      headers,
    });
    assert.isTrue(response.ok);
    const assessmentInstanceUrl = response.url;
    assert.include(assessmentInstanceUrl, '/assessment_instance/');
    context.examAssessmentInstanceUrl = assessmentInstanceUrl;
    const instanceQuestion = await sqldb.queryRow(
      sql.select_instance_question,
      {
        qid: 'addNumbers',
        assessment_id: context.examAssessmentId,
      },
      InstanceQuestionSchema,
    );
    context.examQuestionInstanceUrl = `${context.courseInstanceBaseUrl}/instance_question/${instanceQuestion.id}`;
  });

  test.sequential('student can access E1/Q* in exam mode', async () => {
    const headers = { cookie: 'pl_test_user=test_student; pl_test_mode=Exam' };
    const response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, { headers });
    assert.isTrue(response.ok);
    context.examQuestionVariant = await sqldb.queryRow(
      sql.select_variant,
      { assessment_id: context.examAssessmentId },
      VariantSchema,
    );
  });

  test.sequential('instructor (no role) can view HW1', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.homeworkAssessmentUrl, { headers });
    assert.isTrue(response.ok);
  });

  test.sequential('instructor (no role) can view E1', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.examAssessmentUrl, { headers });
    assert.isTrue(response.ok);
  });

  test.sequential('instructor (no role) cannot view HW1 instance of student', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  test.sequential('instructor (no role) cannot view HW1/Q1 instance of student', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  test.sequential('instructor (no role) cannot view E1 instance of student', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  test.sequential('instructor (no role) cannot view E1/Q* instance of student', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, { headers });
    assert.equal(response.status, 403);
  });

  test.sequential('instructor (student data viewer) can view HW1 instance of student', async () => {
    await insertCourseInstancePermissions({
      course_id: '1',
      user_id: '2',
      course_instance_id: '1',
      course_instance_role: 'Student Data Viewer',
      authn_user_id: '2',
    });
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  test.sequential(
    'instructor (student data viewer) can view HW1/Q1 instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      const response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
    },
  );

  test.sequential('instructor (student data viewer) can view E1 instance of student', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  test.sequential(
    'instructor (student data viewer) can view E1/Q* instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      const response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
    },
  );

  test.sequential(
    'instructor (student data viewer) cannot attach file to HW1 instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$('form[class=attach-text-form]'), 0);
      response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'attach_text',
          __csrf_token,
          filename: 'notes.txt',
          contents: 'This is a test.',
        }),
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  test.sequential(
    'instructor (student data viewer) cannot submit answer to HW1/Q1 instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$('button[name=__action][value=grade]'), 0);
      response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token,
          __variant_id: context.homeworkQuestionVariant.id,
          c: context.homeworkQuestionVariant.true_answer.c,
        }),
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  test.sequential(
    'instructor (student data viewer) cannot attach file to E1 instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$('form[class=attach-text-form]'), 0);
      response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'attach_text',
          __csrf_token,
          filename: 'notes.txt',
          contents: 'This is a test.',
        }),
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  test.sequential(
    'instructor (student data viewer) cannot submit answer to E1/Q* instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, { headers });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$('button[name=__action][value=grade]'), 0);
      response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token,
          __variant_id: context.examQuestionVariant.id,
          c: context.examQuestionVariant.true_answer.c,
        }),
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  test.sequential('instructor (student data viewer) cannot emulate student', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_uid=student@example.com',
    };
    const response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  test.sequential(
    'instructor (student data editor) cannot attach file to HW1 instance of student',
    async () => {
      await updateCourseInstancePermissionsRole({
        course_id: '1',
        course_instance_id: '1',
        user_id: '2',
        course_instance_role: 'Student Data Editor',
        authn_user_id: '2',
      });
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$('form[class=attach-text-form]'), 0);
      response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'attach_text',
          __csrf_token,
          filename: 'notes.txt',
          contents: 'This is a test.',
        }),
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  test.sequential(
    'instructor (student data editor) cannot submit answer to HW1/Q1 instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$('button[name=__action][value=grade]'), 0);
      response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token,
          __variant_id: context.homeworkQuestionVariant.id,
          c: context.homeworkQuestionVariant.true_answer.c,
        }),
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  test.sequential(
    'instructor (student data editor) cannot attach file to E1 instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$('form[class=attach-text-form]'), 0);
      response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'attach_text',
          __csrf_token,
          filename: 'notes.txt',
          contents: 'This is a test.',
        }),
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  test.sequential(
    'instructor (student data editor) cannot submit answer to E1/Q* instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, { headers });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$('button[name=__action][value=grade]'), 0);
      response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token,
          __variant_id: context.examQuestionVariant.id,
          c: context.examQuestionVariant.true_answer.c,
        }),
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  test.sequential(
    'instructor (student data editor) can attach file to HW1 instance of emulated student',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl2_requested_uid=student@example.com',
      };
      let response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      helperClient.extractAndSaveCSRFToken(context, response.$, 'form[class=attach-text-form]');
      response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'attach_text',
          __csrf_token: context.__csrf_token,
          filename: 'notes.txt',
          contents: 'This is a test.',
        }),
        headers,
      });
      assert.isTrue(response.ok);
    },
  );

  test.sequential(
    'instructor (student data editor) can submit answer to HW1/Q1 instance of emulated student',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl2_requested_uid=student@example.com',
      };
      let response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      helperClient.extractAndSaveCSRFToken(context, response.$, 'form[name=question-form]');
      assert.lengthOf(response.$('button[name=__action][value=grade]'), 1);
      response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token: context.__csrf_token,
          __variant_id: context.homeworkQuestionVariant.id,
          c: context.homeworkQuestionVariant.true_answer.c,
        }),
        headers,
      });
      assert.isTrue(response.ok);
    },
  );

  test.sequential(
    'instructor (student data editor) can attach file to E1 instance of emulated student',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_uid=student@example.com; pl_test_mode=Exam',
      };
      let response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      helperClient.extractAndSaveCSRFToken(context, response.$, 'form[class=attach-text-form]');
      response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'attach_text',
          __csrf_token: context.__csrf_token,
          filename: 'notes.txt',
          contents: 'This is a test.',
        }),
        headers,
      });
      assert.isTrue(response.ok);
    },
  );

  test.sequential(
    'instructor (student data editor) can submit answer to E1/Q* instance of emulated student',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_uid=student@example.com; pl_test_mode=Exam',
      };
      let response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, { headers });
      assert.isTrue(response.ok);
      helperClient.extractAndSaveCSRFToken(context, response.$, 'form[name=question-form]');
      assert.lengthOf(response.$('button[name=__action][value=grade]'), 1);
      response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: 'grade',
          __csrf_token: context.__csrf_token,
          __variant_id: context.examQuestionVariant.id,
          c: context.examQuestionVariant.true_answer.c,
        }),
        headers,
      });
      assert.isTrue(response.ok);
    },
  );

  test.sequential('instructor (student data editor) can view gradebook', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/instance_admin/gradebook`,
      { headers },
    );
    assert.isTrue(response.ok);
  });

  test.sequential('instructor (student data editor) can view gradebook raw data', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/instance_admin/gradebook/raw_data.json`,
      { headers },
    );
    assert.isTrue(response.ok);
  });

  test.sequential(
    'instructor (student data editor) can view homework assessment instances',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      const response = await helperClient.fetchCheerio(
        `${context.courseInstanceBaseUrl}/instructor/assessment/${context.homeworkAssessmentId}/instances`,
        { headers },
      );
      assert.isTrue(response.ok);
    },
  );

  test.sequential(
    'instructor (student data editor) can view homework assessment instances raw data',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      const response = await helperClient.fetchCheerio(
        `${context.courseInstanceBaseUrl}/instructor/assessment/${context.homeworkAssessmentId}/instances/raw_data.json`,
        { headers },
      );
      assert.isTrue(response.ok);
    },
  );

  test.sequential(
    'instructor (student data editor) can view exam assessment instances',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      const response = await helperClient.fetchCheerio(
        `${context.courseInstanceBaseUrl}/instructor/assessment/${context.examAssessmentId}/instances`,
        { headers },
      );
      assert.isTrue(response.ok);
    },
  );

  test.sequential(
    'instructor (student data editor) can view exam assessment instances raw data',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      const response = await helperClient.fetchCheerio(
        `${context.courseInstanceBaseUrl}/instructor/assessment/${context.examAssessmentId}/instances/raw_data.json`,
        { headers },
      );
      assert.isTrue(response.ok);
    },
  );

  test.sequential('instructor (student data viewer) can view gradebook', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_requested_course_instance_role=Student Data Viewer',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/instance_admin/gradebook`,
      { headers },
    );
    assert.isTrue(response.ok);
  });

  test.sequential('instructor (student data viewer) can view gradebook raw data', async () => {
    const headers = {
      cookie:
        'pl_test_user=test_instructor; pl2_requested_course_instance_role=Student Data Viewer',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/instance_admin/gradebook/raw_data.json`,
      { headers },
    );
    assert.isTrue(response.ok);
  });

  test.sequential(
    'instructor (student data viewer) can view homework assessment instances',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_instance_role=Student Data Viewer',
      };
      const response = await helperClient.fetchCheerio(
        `${context.courseInstanceBaseUrl}/instructor/assessment/${context.homeworkAssessmentId}/instances`,
        { headers },
      );
      assert.isTrue(response.ok);
    },
  );

  test.sequential(
    'instructor (student data viewer) can view homework assessment instances raw data',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_instance_role=Student Data Viewer',
      };
      const response = await helperClient.fetchCheerio(
        `${context.courseInstanceBaseUrl}/instructor/assessment/${context.homeworkAssessmentId}/instances/raw_data.json`,
        { headers },
      );
      assert.isTrue(response.ok);
    },
  );

  test.sequential(
    'instructor (student data viewer) can view exam assessment instances',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_instance_role=Student Data Viewer',
      };
      const response = await helperClient.fetchCheerio(
        `${context.courseInstanceBaseUrl}/instructor/assessment/${context.examAssessmentId}/instances`,
        { headers },
      );
      assert.isTrue(response.ok);
    },
  );

  test.sequential(
    'instructor (student data viewer) can view exam assessment instances raw data',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_instance_role=Student Data Viewer',
      };
      const response = await helperClient.fetchCheerio(
        `${context.courseInstanceBaseUrl}/instructor/assessment/${context.examAssessmentId}/instances/raw_data.json`,
        { headers },
      );
      assert.isTrue(response.ok);
    },
  );

  test.sequential('instructor (no role) can view gradebook', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_course_instance_role=None',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/instance_admin/gradebook`,
      { headers },
    );
    // This page itself is visible even if the user doesn't have permissions to
    // view student data, but it won't actually show student data, which is
    // loaded asynchronously via the `raw_data.json` endpoint, which is tested
    // below.
    //
    // This page should contain a warning that the user doesn't have access to
    // student data, and a prompt to obtain access.
    assert.lengthOf(response.$('table#gradebook-data'), 0);
    assert.lengthOf(response.$('h2:contains("Insufficient permissions")'), 1);
  });

  test.sequential('instructor (no role) cannot view gradebook raw data', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_course_instance_role=None',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/instance_admin/gradebook/raw_data.json`,
      { headers },
    );
    assert.equal(response.status, 403);
  });

  test.sequential('instructor (no role) cannot view homework assessment instances', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_course_instance_role=None',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/assessment/${context.homeworkAssessmentId}/instances`,
      { headers },
    );
    assert.equal(response.status, 403);
  });

  test.sequential(
    'instructor (no role) cannot view homework assessment instances raw data',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl2_requested_course_instance_role=None',
      };
      const response = await helperClient.fetchCheerio(
        `${context.courseInstanceBaseUrl}/instructor/assessment/${context.homeworkAssessmentId}/instances/raw_data.json`,
        { headers },
      );
      assert.equal(response.status, 403);
    },
  );

  test.sequential('instructor (no role) cannot view exam assessment instances', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl2_requested_course_instance_role=None',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/assessment/${context.examAssessmentId}/instances`,
      { headers },
    );
    assert.equal(response.status, 403);
  });

  test.sequential(
    'instructor (no role) cannot view exam assessment instances raw data',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl2_requested_course_instance_role=None',
      };
      const response = await helperClient.fetchCheerio(
        `${context.courseInstanceBaseUrl}/instructor/assessment/${context.examAssessmentId}/instances/raw_data.json`,
        { headers },
      );
      assert.equal(response.status, 403);
    },
  );
});
