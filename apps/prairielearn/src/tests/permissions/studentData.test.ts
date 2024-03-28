import { assert } from 'chai';
import { step } from 'mocha-steps';
import * as sqldb from '@prairielearn/postgres';

import { config } from '../../lib/config';
import * as helperServer from '../helperServer';
import * as helperClient from '../helperClient';
import { ensureEnrollment } from '../../models/enrollment';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  updateCourseInstancePermissionsRole,
} from '../../models/course-permissions';

const sql = sqldb.loadSqlEquiv(__filename);

describe('student data access', function () {
  this.timeout(60000);

  const context: Record<string, any> = {};
  context.siteUrl = `http://localhost:${config.serverPort}`;
  context.baseUrl = `${context.siteUrl}/pl`;
  context.courseInstanceBaseUrl = `${context.baseUrl}/course_instance/1`;
  context.userIdInstructor = 2;
  context.userIdStudent = 2;

  before('set up testing server', async function () {
    await helperServer.before().call(this);
    let result = await sqldb.queryOneRowAsync(sql.select_homework1, []);
    context.homeworkAssessmentId = result.rows[0].id;
    context.homeworkAssessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.homeworkAssessmentId}/`;
    result = await sqldb.queryOneRowAsync(sql.select_exam1, []);
    context.examAssessmentId = result.rows[0].id;
    context.examAssessmentUrl = `${context.courseInstanceBaseUrl}/assessment/${context.examAssessmentId}/`;
  });

  before('insert users', async function () {
    await sqldb.callAsync('users_select_or_insert', [
      'instructor@illinois.edu',
      'Instructor User',
      '100000000',
      'dev',
    ]);
    await sqldb.callAsync('users_select_or_insert', [
      'student@illinois.edu',
      'Student User',
      '000000001',
      'dev',
    ]);
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'instructor@illinois.edu',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    await ensureEnrollment({
      user_id: '3',
      course_instance_id: '1',
    });
  });

  after('shut down testing server', helperServer.after);

  step('student can start HW1', async () => {
    const headers = { cookie: 'pl_test_user=test_student' };
    const response = await helperClient.fetchCheerio(context.homeworkAssessmentUrl, { headers });
    assert.isTrue(response.ok);
    const assessmentInstanceUrl = response.url;
    assert.include(assessmentInstanceUrl, '/assessment_instance/');
    context.homeworkAssessmentInstanceUrl = assessmentInstanceUrl;
    const questionUrl = response.$('a:contains("Add two numbers")').attr('href');
    context.homeworkQuestionInstanceUrl = `${context.siteUrl}${questionUrl}`;
  });

  step('student can access HW1/Q1', async () => {
    const headers = { cookie: 'pl_test_user=test_student' };
    const response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
      headers,
    });
    assert.isTrue(response.ok);
    const result = await sqldb.queryOneRowAsync(sql.select_variant, {
      assessment_id: context.homeworkAssessmentId,
    });
    context.homeworkQuestionVariant = result.rows[0];
  });

  step('student can access E1 in exam mode', async () => {
    const headers = { cookie: 'pl_test_user=test_student; pl_test_mode=Exam' };
    const response = await helperClient.fetchCheerio(context.examAssessmentUrl, { headers });
    assert.isTrue(response.ok);
    assert.equal(response.$('#start-assessment').text(), 'Start assessment');
    helperClient.extractAndSaveCSRFToken(context, response.$, 'form');
  });

  step('student can start E1 in exam mode', async () => {
    const headers = { cookie: 'pl_test_user=test_student; pl_test_mode=Exam' };
    const form = {
      __action: 'new_instance',
      __csrf_token: context.__csrf_token,
    };
    const response = await helperClient.fetchCheerio(context.examAssessmentUrl, {
      method: 'POST',
      form,
      headers,
    });
    assert.isTrue(response.ok);
    const assessmentInstanceUrl = response.url;
    assert.include(assessmentInstanceUrl, '/assessment_instance/');
    context.examAssessmentInstanceUrl = assessmentInstanceUrl;
    const result = await sqldb.queryOneRowAsync(sql.select_instance_question, {
      qid: 'addNumbers',
      assessment_id: context.examAssessmentId,
    });
    context.examQuestionInstanceUrl = `${context.courseInstanceBaseUrl}/instance_question/${result.rows[0].id}`;
  });

  step('student can access E1/Q* in exam mode', async () => {
    const headers = { cookie: 'pl_test_user=test_student; pl_test_mode=Exam' };
    const response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, { headers });
    assert.isTrue(response.ok);
    const result = await sqldb.queryOneRowAsync(sql.select_variant, {
      assessment_id: context.examAssessmentId,
    });
    context.examQuestionVariant = result.rows[0];
  });

  step('instructor (no role) can view HW1', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.homeworkAssessmentUrl, { headers });
    assert.isTrue(response.ok);
  });

  step('instructor (no role) can view E1', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.examAssessmentUrl, { headers });
    assert.isTrue(response.ok);
  });

  step('instructor (no role) cannot view HW1 instance of student', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('instructor (no role) cannot view HW1/Q1 instance of student', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('instructor (no role) cannot view E1 instance of student', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step('instructor (no role) cannot view E1/Q* instance of student', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, { headers });
    assert.equal(response.status, 403);
  });

  step('instructor (student data viewer) can view HW1 instance of student', async () => {
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

  step('instructor (student data viewer) can view HW1/Q1 instance of student', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step('instructor (student data viewer) can view E1 instance of student', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
      headers,
    });
    assert.isTrue(response.ok);
  });

  step('instructor (student data viewer) can view E1/Q* instance of student', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, { headers });
    assert.isTrue(response.ok);
  });

  step(
    'instructor (student data viewer) cannot attach file to HW1 instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$(`form[class=attach-text-form]`), 0);
      const form = {
        __action: 'attach_text',
        __csrf_token,
        filename: 'notes.txt',
        contents: 'This is a test.',
      };
      response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
        method: 'POST',
        form,
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  step(
    'instructor (student data viewer) cannot submit answer to HW1/Q1 instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$(`button[name=__action][value=grade]`), 0);
      const form = {
        __action: 'grade',
        __csrf_token,
        __variant_id: context.homeworkQuestionVariant.id,
        c: context.homeworkQuestionVariant.true_answer.c,
      };
      response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
        method: 'POST',
        form,
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  step(
    'instructor (student data viewer) cannot attach file to E1 instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$(`form[class=attach-text-form]`), 0);
      const form = {
        __action: 'attach_text',
        __csrf_token,
        filename: 'notes.txt',
        contents: 'This is a test.',
      };
      response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
        method: 'POST',
        form,
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  step(
    'instructor (student data viewer) cannot submit answer to E1/Q* instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, { headers });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$(`button[name=__action][value=grade]`), 0);
      const form = {
        __action: 'grade',
        __csrf_token,
        __variant_id: context.examQuestionVariant.id,
        c: context.examQuestionVariant.true_answer.c,
      };
      response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, {
        method: 'POST',
        form,
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  step('instructor (student data viewer) cannot emulate student', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_uid=student@illinois.edu',
    };
    const response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
      headers,
    });
    assert.equal(response.status, 403);
  });

  step(
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
      assert.lengthOf(response.$(`form[class=attach-text-form]`), 0);
      const form = {
        __action: 'attach_text',
        __csrf_token,
        filename: 'notes.txt',
        contents: 'This is a test.',
      };
      response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
        method: 'POST',
        form,
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  step(
    'instructor (student data editor) cannot submit answer to HW1/Q1 instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$(`button[name=__action][value=grade]`), 0);
      const form = {
        __action: 'grade',
        __csrf_token,
        __variant_id: context.homeworkQuestionVariant.id,
        c: context.homeworkQuestionVariant.true_answer.c,
      };
      response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
        method: 'POST',
        form,
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  step(
    'instructor (student data editor) cannot attach file to E1 instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$(`form[class=attach-text-form]`), 0);
      const form = {
        __action: 'attach_text',
        __csrf_token,
        filename: 'notes.txt',
        contents: 'This is a test.',
      };
      response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
        method: 'POST',
        form,
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  step(
    'instructor (student data editor) cannot submit answer to E1/Q* instance of student',
    async () => {
      const headers = { cookie: 'pl_test_user=test_instructor' };
      let response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, { headers });
      assert.isTrue(response.ok);
      const __csrf_token = response.$('span[id=test_csrf_token]').text();
      assert.lengthOf(response.$(`button[name=__action][value=grade]`), 0);
      const form = {
        __action: 'grade',
        __csrf_token,
        __variant_id: context.examQuestionVariant.id,
        c: context.examQuestionVariant.true_answer.c,
      };
      response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, {
        method: 'POST',
        form,
        headers,
      });
      assert.equal(response.status, 403);
    },
  );

  step(
    'instructor (student data editor) can attach file to HW1 instance of emulated student',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl_requested_uid=student@illinois.edu',
      };
      let response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      helperClient.extractAndSaveCSRFToken(context, response.$, 'form[class=attach-text-form]');
      const form = {
        __action: 'attach_text',
        __csrf_token: context.__csrf_token,
        filename: 'notes.txt',
        contents: 'This is a test.',
      };
      response = await helperClient.fetchCheerio(context.homeworkAssessmentInstanceUrl, {
        method: 'POST',
        form,
        headers,
      });
      assert.isTrue(response.ok);
    },
  );

  step(
    'instructor (student data editor) can submit answer to HW1/Q1 instance of emulated student',
    async () => {
      const headers = {
        cookie: 'pl_test_user=test_instructor; pl_requested_uid=student@illinois.edu',
      };
      let response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      helperClient.extractAndSaveCSRFToken(context, response.$, 'form[name=question-form]');
      assert.lengthOf(response.$(`button[name=__action][value=grade]`), 1);
      const form = {
        __action: 'grade',
        __csrf_token: context.__csrf_token,
        __variant_id: context.homeworkQuestionVariant.id,
        c: context.homeworkQuestionVariant.true_answer.c,
      };
      response = await helperClient.fetchCheerio(context.homeworkQuestionInstanceUrl, {
        method: 'POST',
        form,
        headers,
      });
      assert.isTrue(response.ok);
    },
  );

  step(
    'instructor (student data editor) can attach file to E1 instance of emulated student',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl_requested_uid=student@illinois.edu; pl_requested_mode=Exam',
      };
      let response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
        headers,
      });
      assert.isTrue(response.ok);
      helperClient.extractAndSaveCSRFToken(context, response.$, 'form[class=attach-text-form]');
      const form = {
        __action: 'attach_text',
        __csrf_token: context.__csrf_token,
        filename: 'notes.txt',
        contents: 'This is a test.',
      };
      response = await helperClient.fetchCheerio(context.examAssessmentInstanceUrl, {
        method: 'POST',
        form,
        headers,
      });
      assert.isTrue(response.ok);
    },
  );

  step(
    'instructor (student data editor) can submit answer to E1/Q* instance of emulated student',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl_requested_uid=student@illinois.edu; pl_requested_mode=Exam',
      };
      let response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, { headers });
      assert.isTrue(response.ok);
      helperClient.extractAndSaveCSRFToken(context, response.$, 'form[name=question-form]');
      assert.lengthOf(response.$(`button[name=__action][value=grade]`), 1);
      const form = {
        __action: 'grade',
        __csrf_token: context.__csrf_token,
        __variant_id: context.examQuestionVariant.id,
        c: context.examQuestionVariant.true_answer.c,
      };
      response = await helperClient.fetchCheerio(context.examQuestionInstanceUrl, {
        method: 'POST',
        form,
        headers,
      });
      assert.isTrue(response.ok);
    },
  );

  step('instructor (student data editor) can view gradebook', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/instance_admin/gradebook`,
      { headers },
    );
    assert.isTrue(response.ok);
  });

  step('instructor (student data editor) can view gradebook raw data', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/instance_admin/gradebook/raw_data.json`,
      { headers },
    );
    assert.isTrue(response.ok);
  });

  step('instructor (student data editor) can view homework assessment instances', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/assessment/${context.homeworkAssessmentId}/instances`,
      { headers },
    );
    assert.isTrue(response.ok);
  });

  step(
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

  step('instructor (student data editor) can view exam assessment instances', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/assessment/${context.examAssessmentId}/instances`,
      { headers },
    );
    assert.isTrue(response.ok);
  });

  step('instructor (student data editor) can view exam assessment instances raw data', async () => {
    const headers = { cookie: 'pl_test_user=test_instructor' };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/assessment/${context.examAssessmentId}/instances/raw_data.json`,
      { headers },
    );
    assert.isTrue(response.ok);
  });

  step('instructor (student data viewer) can view gradebook', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_course_instance_role=Student Data Viewer',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/instance_admin/gradebook`,
      { headers },
    );
    assert.isTrue(response.ok);
  });

  step('instructor (student data viewer) can view gradebook raw data', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_course_instance_role=Student Data Viewer',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/instance_admin/gradebook/raw_data.json`,
      { headers },
    );
    assert.isTrue(response.ok);
  });

  step('instructor (student data viewer) can view homework assessment instances', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_course_instance_role=Student Data Viewer',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/assessment/${context.homeworkAssessmentId}/instances`,
      { headers },
    );
    assert.isTrue(response.ok);
  });

  step(
    'instructor (student data viewer) can view homework assessment instances raw data',
    async () => {
      const headers = {
        cookie:
          'pl_test_user=test_instructor; pl_requested_course_instance_role=Student Data Viewer',
      };
      const response = await helperClient.fetchCheerio(
        `${context.courseInstanceBaseUrl}/instructor/assessment/${context.homeworkAssessmentId}/instances/raw_data.json`,
        { headers },
      );
      assert.isTrue(response.ok);
    },
  );

  step('instructor (student data viewer) can view exam assessment instances', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_course_instance_role=Student Data Viewer',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/assessment/${context.examAssessmentId}/instances`,
      { headers },
    );
    assert.isTrue(response.ok);
  });

  step('instructor (student data viewer) can view exam assessment instances raw data', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_course_instance_role=Student Data Viewer',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/assessment/${context.examAssessmentId}/instances/raw_data.json`,
      { headers },
    );
    assert.isTrue(response.ok);
  });

  step('instructor (no role) can view gradebook', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_course_instance_role=None',
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

  step('instructor (no role) cannot view gradebook raw data', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_course_instance_role=None',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/instance_admin/gradebook/raw_data.json`,
      { headers },
    );
    assert.equal(response.status, 403);
  });

  step('instructor (no role) cannot view homework assessment instances', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_course_instance_role=None',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/assessment/${context.homeworkAssessmentId}/instances`,
      { headers },
    );
    assert.equal(response.status, 403);
  });

  step('instructor (no role) cannot view homework assessment instances raw data', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_course_instance_role=None',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/assessment/${context.homeworkAssessmentId}/instances/raw_data.json`,
      { headers },
    );
    assert.equal(response.status, 403);
  });

  step('instructor (no role) cannot view exam assessment instances', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_course_instance_role=None',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/assessment/${context.examAssessmentId}/instances`,
      { headers },
    );
    assert.equal(response.status, 403);
  });

  step('instructor (no role) cannot view exam assessment instances raw data', async () => {
    const headers = {
      cookie: 'pl_test_user=test_instructor; pl_requested_course_instance_role=None',
    };
    const response = await helperClient.fetchCheerio(
      `${context.courseInstanceBaseUrl}/instructor/assessment/${context.examAssessmentId}/instances/raw_data.json`,
      { headers },
    );
    assert.equal(response.status, 403);
  });
});
