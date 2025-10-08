import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it, test } from 'vitest';

import { insertAccessToken } from '../models/access-token.js';

import * as helperExam from './helperExam.js';
import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';

const locals: Record<string, any> = {};

const assessmentPoints = 5;

describe('API', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  helperExam.startExam(locals, 'exam1-automaticTestSuite');

  describe('grade correct answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: assessmentPoints,
          instance_question_score_perc: (assessmentPoints / 5) * 100,
          assessment_instance_points: assessmentPoints,
          assessment_instance_score_perc:
            (assessmentPoints / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            c: variant.true_answer.c,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('settings page', function () {
    it('loads successfully', async function () {
      locals.settingsUrl = locals.baseUrl + '/settings';
      const res = await fetch(locals.settingsUrl);
      assert.isTrue(res.ok);
      const page$ = cheerio.load(await res.text());

      const button = page$('[data-testid="generate-token-button"]').get(0);
      assert(button);

      // Load the popover content
      assert.isString(button.attribs['data-bs-content']);

      const data$ = cheerio.load(button.attribs['data-bs-content']);

      // Validate that the CSRF token is present
      const csrfInput = data$('form input[name="__csrf_token"]').get(0);
      const csrfToken = csrfInput?.attribs.value;
      assert.isString(csrfToken);

      // Store CSRF token for later requests
      locals.__csrf_token = csrfToken;

      // Validate the action input
      const actionInput = data$('form input[name="__action"]').get(0);
      const action = actionInput?.attribs.value;
      assert.equal(action, 'token_generate');

      // Persist the action for later
      // TODO: just hardcode this!
      locals.__action = action;

      // Validate that there's an input for the token name
      assert.lengthOf(data$('form input[name="token_name"]'), 1);

      // There shouldn't be an access token displayed on the page
      assert.lengthOf(page$('.new-access-token'), 0);
    });

    it('generates a token', async function () {
      const res = await fetch(locals.settingsUrl, {
        method: 'POST',
        body: new URLSearchParams({
          __action: locals.__action,
          __csrf_token: locals.__csrf_token,
          token_name: 'test',
        }),
        redirect: 'follow',
      });
      assert.isTrue(res.ok);

      // Extract the token from the response
      const page$ = cheerio.load(await res.text());
      const tokenContainer = page$('.new-access-token');
      assert.lengthOf(tokenContainer, 1);
      locals.api_token = tokenContainer.text().trim();

      // Check that the token has the correct format
      assert.ok(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(locals.api_token),
      );
    });

    it('settings page does not show token again after reloading', async function () {
      const res = await fetch(locals.settingsUrl);
      assert.isTrue(res.ok);
      const pageContent = await res.text();
      assert.isFalse(pageContent.includes(locals.api_token));
    });
  });

  describe('API endpoints', function () {
    test.sequential('GET to API for assessments fails without token', async function () {
      locals.apiUrl = locals.baseUrl + '/api/v1';
      locals.apiCourseInstanceUrl = locals.apiUrl + '/course_instances/1';
      locals.apiAssessmentsUrl = locals.apiCourseInstanceUrl + '/assessments';
      const res = await fetch(locals.apiAssessmentsUrl);
      assert.equal(res.status, 401);
    });

    test.sequential('GET to API for assessments fails with an incorrect token', async function () {
      const res = await fetch(locals.apiAssessmentsUrl, {
        headers: {
          'Private-Token': '12345678-1234-1234-1234-1234567890ab',
        },
      });
      assert.equal(res.status, 401);
    });

    test.sequential(
      'GET to API for assessments succeeds with the correct token',
      async function () {
        const res = await fetch(locals.apiAssessmentsUrl, {
          headers: {
            'Private-Token': locals.api_token,
          },
        });
        assert.equal(res.status, 200);

        const json = (await res.json()) as any;

        const assessment = json.find((o) => o.assessment_name === 'exam1-automaticTestSuite');
        assert.exists(assessment);
        assert.equal(assessment.assessment_label, 'E1');

        // Persist the assessment ID for later requests
        locals.assessment_id = assessment.assessment_id;
      },
    );

    test.sequential('GET to API for single assessment succeeds', async function () {
      locals.apiAssessmentUrl =
        locals.apiCourseInstanceUrl + `/assessments/${locals.assessment_id}`;

      const res = await fetch(locals.apiAssessmentUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;

      assert.equal(json.assessment_id, locals.assessment_id);
      assert.equal(json.assessment_label, 'E1');
    });

    test.sequential('GET to API for assessment instances succeeds', async function () {
      locals.apiAssessmentInstancesUrl =
        locals.apiCourseInstanceUrl + `/assessments/${locals.assessment_id}/assessment_instances`;

      const res = await fetch(locals.apiAssessmentInstancesUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      const assessmentInstance = json[0];
      assert.equal(assessmentInstance.user_uid, 'dev@example.com');
      assert.equal(assessmentInstance.points, assessmentPoints);
      assert.equal(assessmentInstance.max_points, helperExam.exam1AutomaticTestSuite.maxPoints);

      // Persist the assessment instance ID for later requests
      locals.assessment_instance_id = assessmentInstance.assessment_instance_id;
    });

    test.sequential('GET to API for a single assessment instance succeeds', async function () {
      locals.apiAssessmentInstanceUrl =
        locals.apiCourseInstanceUrl + `/assessment_instances/${locals.assessment_instance_id}`;

      const res = await fetch(locals.apiAssessmentInstanceUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });

      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.equal(json.assessment_instance_id, locals.assessment_instance_id);
      assert.equal(json.assessment_id, locals.assessment_id);
      assert.equal(json.user_uid, 'dev@example.com');
      assert.equal(json.points, assessmentPoints);
      assert.equal(json.max_points, helperExam.exam1AutomaticTestSuite.maxPoints);
    });

    test.sequential('GET to API for assessment submissions succeeds', async function () {
      locals.apiSubmissionsUrl =
        locals.apiCourseInstanceUrl +
        `/assessment_instances/${locals.assessment_instance_id}/submissions`;

      const res = await fetch(locals.apiSubmissionsUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.lengthOf(json, 1);
      assert.equal(json[0].instance_question_points, assessmentPoints);

      // Persist the submission ID for later requests
      locals.submission_id = json[0].submission_id;
    });

    test.sequential('GET to API for single submission succeeds', async function () {
      locals.apiSubmissionUrl =
        locals.apiCourseInstanceUrl + `/submissions/${locals.submission_id}`;

      const res = await fetch(locals.apiSubmissionUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.equal(json.submission_id, locals.submission_id);
      assert.equal(json.assessment_instance_id, locals.assessment_instance_id);
      assert.equal(json.assessment_id, locals.assessment_id);
      assert.equal(json.instance_question_points, assessmentPoints);
    });

    test.sequential('GET to API for gradebook', async function () {
      locals.apiGradebookUrl = locals.apiCourseInstanceUrl + '/gradebook';
      const res = await fetch(locals.apiGradebookUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      const user = json.find((o) => o.user_uid === 'dev@example.com');
      assert.exists(user);
      const assessment = user.assessments.find((o) => o.assessment_label === 'E1');
      assert.exists(assessment);
      assert.equal(assessment.points, assessmentPoints);
      assert.equal(assessment.max_points, helperExam.exam1AutomaticTestSuite.maxPoints);
    });

    test.sequential('GET to API for assessment instance questions succeeds', async function () {
      locals.apiInstanceQuestionUrl =
        locals.apiCourseInstanceUrl +
        `/assessment_instances/${locals.assessment_instance_id}/instance_questions`;

      const res = await fetch(locals.apiInstanceQuestionUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });

      const json = (await res.json()) as any;
      assert.lengthOf(json, 7);
    });

    test.sequential('GET to API for assessment instance log succeeds', async function () {
      locals.apiAssessmentInstanceLogUrl =
        locals.apiCourseInstanceUrl + `/assessment_instances/${locals.assessment_instance_id}/log`;

      const res = await fetch(locals.apiAssessmentInstanceLogUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.isArray(json);
    });

    test.sequential(
      'GET to API for non-existent assessment instance returns 404',
      async function () {
        const res = await fetch(locals.apiCourseInstanceUrl + '/assessment_instances/999999', {
          headers: {
            'Private-Token': locals.api_token,
          },
        });
        assert.equal(res.status, 404);

        const json = (await res.json()) as any;
        assert.equal(json.message, 'Not Found');
      },
    );

    test.sequential(
      'GET to API for non-existent assessment instance log returns 404',
      async function () {
        const res = await fetch(locals.apiCourseInstanceUrl + '/assessment_instances/999999/log', {
          headers: {
            'Private-Token': locals.api_token,
          },
        });
        assert.equal(res.status, 404);

        const json = (await res.json()) as any;
        assert.equal(json.message, 'Not Found');
      },
    );

    test.sequential('GET to API for assessment access rules succeeds', async function () {
      locals.apiAssessmentAccessRulesUrl =
        locals.apiCourseInstanceUrl +
        `/assessments/${locals.assessment_id}/assessment_access_rules`;

      const res = await fetch(locals.apiAssessmentAccessRulesUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.lengthOf(json, 1);
    });

    test.sequential('GET to API for course instance access rules succeeds', async function () {
      locals.apiCourseInstanceAccessRulesUrl =
        locals.apiCourseInstanceUrl + '/course_instance_access_rules';
      const res = await fetch(locals.apiCourseInstanceAccessRulesUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.lengthOf(json, 1);
    });

    test.sequential('GET to API for course instance info succeeds', async function () {
      const res = await fetch(locals.apiCourseInstanceUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.exists(json.course_instance_id);
      assert.exists(json.course_title);
    });

    test.sequential('GET to API for course instance info fails in exam mode', async () => {
      const res = await fetch(locals.apiCourseInstanceUrl, {
        headers: {
          'Private-Token': locals.api_token,
          Cookie: 'pl_test_mode=Exam',
        },
      });
      assert.equal(res.status, 403);
    });

    test.sequential('POST to API to start a course sync', async function () {
      locals.apiCourseUrl = locals.apiUrl + '/course/1';
      locals.apiCourseSyncUrl = locals.apiCourseUrl + '/sync';
      const res = await fetch(locals.apiCourseSyncUrl, {
        method: 'POST',
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.exists(json.job_sequence_id);
      locals.course_sync_job_sequence_id = json.job_sequence_id;
    });

    test.sequential('GET to API for course sync status info succeeds', async function () {
      locals.apiCourseSyncJobUrl =
        locals.apiCourseSyncUrl + '/' + locals.course_sync_job_sequence_id;
      const res = await fetch(locals.apiCourseSyncJobUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.exists(json.job_sequence_id);
      assert.equal(json.job_sequence_id, locals.course_sync_job_sequence_id);
      assert.exists(json.status);
      assert.exists(json.start_date);
      assert.exists(json.finish_date);
      assert.exists(json.output);
    });

    test.sequential(
      'GET to API for course sync status info fails with invalid job_sequence_id',
      async function () {
        locals.apiCourseSyncJobUrl = locals.apiCourseSyncUrl + '/NA';
        const res = await fetch(locals.apiCourseSyncJobUrl, {
          headers: {
            'Private-Token': locals.api_token,
          },
        });
        assert.equal(res.status, 404);
      },
    );

    test.sequential(
      'POST to add user to staff list as a previewer of a specific course succeeds',
      async function () {
        locals.apiCourseStaffUrl = locals.apiCourseUrl + '/staff';
        const res = await fetch(locals.apiCourseStaffUrl, {
          method: 'POST',
          headers: {
            'Private-Token': locals.api_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uid: 'dev@example.com',
            course_role: 'Previewer',
          }),
        });
        assert.equal(res.status, 204);
      },
    );

    test.sequential('POST trying to add user with missing uid fails', async function () {
      locals.apiCourseStaffUrl = locals.apiCourseUrl + '/staff';
      const res = await fetch(locals.apiCourseStaffUrl, {
        method: 'POST',
        headers: {
          'Private-Token': locals.api_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          course_role: 'Previewer',
        }),
      });
      assert.equal(res.status, 400);
    });

    test.sequential('POST trying to add user with missing role fails', async function () {
      locals.apiCourseStaffUrl = locals.apiCourseUrl + '/staff';
      const res = await fetch(locals.apiCourseStaffUrl, {
        method: 'POST',
        headers: {
          'Private-Token': locals.api_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid: 'dev@example.com',
        }),
      });
      assert.equal(res.status, 400);
    });

    test.sequential(
      'PUT to update user in staff list to an owner of a specific course succeeds',
      async function () {
        const res = await fetch(locals.apiCourseStaffUrl, {
          method: 'PUT',
          headers: {
            'Private-Token': locals.api_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uid: 'dev@example.com',
            course_role: 'Owner',
          }),
        });
        assert.equal(res.status, 204);
      },
    );

    test.sequential(
      'PUT to update user in staff list to an owner of a specific course with invalid user fails',
      async function () {
        const res = await fetch(locals.apiCourseStaffUrl, {
          method: 'PUT',
          headers: {
            'Private-Token': locals.api_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uid: '',
            course_role: 'Owner',
          }),
        });
        assert.equal(res.status, 400);
      },
    );

    test.sequential(
      'PUT to update user in staff list to an owner of a specific course with empty role fails',
      async function () {
        const res = await fetch(locals.apiCourseStaffUrl, {
          method: 'PUT',
          headers: {
            'Private-Token': locals.api_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uid: 'dev@example.com',
            course_role: '',
          }),
        });
        assert.equal(res.status, 400);
      },
    );

    test.sequential(
      'PUT to update user in staff list to an owner of a specific course with invalid role fails',
      async function () {
        const res = await fetch(locals.apiCourseStaffUrl, {
          method: 'PUT',
          headers: {
            'Private-Token': locals.api_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uid: 'dev@example.com',
            course_role: 'invalid',
          }),
        });
        assert.equal(res.status, 400);
      },
    );

    test.sequential(
      'POST to give user access to student data of a specific course instance succeeds',
      async function () {
        locals.apiCourseInstanceStaffUrl = locals.apiCourseStaffUrl + '/course_instance/1';
        const res = await fetch(locals.apiCourseInstanceStaffUrl, {
          method: 'POST',
          headers: {
            'Private-Token': locals.api_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uid: 'dev@example.com',
            course_instance_role: 'Student Data Viewer',
          }),
        });
        assert.equal(res.status, 204);
      },
    );

    test.sequential(
      'POST to give user access to student data with missing uid fails',
      async function () {
        locals.apiCourseInstanceStaffUrl = locals.apiCourseStaffUrl + '/course_instance/1';
        const res = await fetch(locals.apiCourseInstanceStaffUrl, {
          method: 'POST',
          headers: {
            'Private-Token': locals.api_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            course_instance_role: 'Student Data Viewer',
          }),
        });
        assert.equal(res.status, 400);
      },
    );

    test.sequential(
      'POST to give user access to student data with missing role fails',
      async function () {
        locals.apiCourseInstanceStaffUrl = locals.apiCourseStaffUrl + '/course_instance/1';
        const res = await fetch(locals.apiCourseInstanceStaffUrl, {
          method: 'POST',
          headers: {
            'Private-Token': locals.api_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uid: 'dev@example.com',
          }),
        });
        assert.equal(res.status, 400);
      },
    );

    test.sequential(
      'PUT to update users access to student data of a specific course instance succeeds',
      async function () {
        const res = await fetch(locals.apiCourseInstanceStaffUrl, {
          method: 'PUT',
          headers: {
            'Private-Token': locals.api_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uid: 'dev@example.com',
            course_instance_role: 'Student Data Editor',
          }),
        });
        assert.equal(res.status, 204);
      },
    );

    test.sequential(
      'PUT to update non-existent users access to student data of a specific course instance fails',
      async function () {
        const res = await fetch(locals.apiCourseInstanceStaffUrl, {
          method: 'PUT',
          headers: {
            'Private-Token': locals.api_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uid: '',
            course_instance_role: 'Student Data Editor',
          }),
        });
        assert.equal(res.status, 400);
      },
    );

    test.sequential(
      'PUT to update users access to invalid student data role of a specific course instance fails',
      async function () {
        const res = await fetch(locals.apiCourseInstanceStaffUrl, {
          method: 'PUT',
          headers: {
            'Private-Token': locals.api_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uid: 'dev@example.com',
            course_instance_role: '',
          }),
        });
        assert.equal(res.status, 400);
      },
    );

    test.sequential('GET to /staff returns JSON of course staff permissions', async function () {
      const res = await fetch(locals.apiCourseStaffUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.exists(json);
      assert.equal(json[0].user.uid, 'dev@example.com');
      assert.equal(json[0].course_permission.course_role, 'Owner');
      assert.equal(json[0].course_instance_roles[0].course_instance_role, 'Student Data Editor');
    });

    test.sequential('GET to /staff fails with incorrect permissions', async function () {
      const editor = await getOrCreateUser({
        uid: 'editor@example.com',
        name: 'Editor User',
        uin: 'editor',
        email: 'editor@example.com',
      });

      const token = await insertAccessToken(editor.user_id, 'invalidToken');

      const res = await fetch(locals.apiCourseStaffUrl, {
        headers: {
          'Private-Token': token,
        },
      });
      assert.equal(res.status, 403);
    });

    test.sequential('GET to /staff fails with incorrect token', async function () {
      const res = await fetch(locals.apiCourseStaffUrl, {
        headers: {
          'Private-Token': '12345678-1234-1234-1234-1234567890ab',
        },
      });
      assert.equal(res.status, 401);
    });

    test.sequential(
      'DELETE users access to student data of a specific course instance succeeds',
      async function () {
        const res = await fetch(locals.apiCourseInstanceStaffUrl, {
          method: 'DELETE',
          headers: {
            'Private-Token': locals.api_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uid: 'dev@example.com',
          }),
        });
        assert.equal(res.status, 204);
      },
    );

    test.sequential('DELETE student data access with missing `uid` fails', async function () {
      const res = await fetch(locals.apiCourseInstanceStaffUrl, {
        method: 'DELETE',
        headers: {
          'Private-Token': locals.api_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    });

    test.sequential(
      'Use GET endpoint to verify that student data access was removed',
      async function () {
        const res = await fetch(locals.apiCourseStaffUrl, {
          headers: {
            'Private-Token': locals.api_token,
          },
        });
        assert.equal(res.status, 200);

        const json = (await res.json()) as any;
        assert.exists(json);
        assert.equal(json[0].user.uid, 'dev@example.com');
        assert.equal(json[0].course_permission.course_role, 'Owner');
        assert.isNull(json[0].course_instance_roles);
      },
    );

    test.sequential('DELETE user with missing `uid` fails', async function () {
      const res = await fetch(locals.apiCourseStaffUrl, {
        method: 'DELETE',
        headers: {
          'Private-Token': locals.api_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 400);
    });

    test.sequential('DELETE user from staff list of a specific course succeeds', async function () {
      const res = await fetch(locals.apiCourseStaffUrl, {
        method: 'DELETE',
        headers: {
          'Private-Token': locals.api_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uid: 'dev@example.com',
        }),
      });
      assert.equal(res.status, 204);
    });

    test.sequential('Use GET endpoint to verify that staff access was removed', async function () {
      const res = await fetch(locals.apiCourseStaffUrl, {
        headers: {
          'Private-Token': locals.api_token,
        },
      });
      assert.equal(res.status, 200);

      const output = (await res.json()) as any;
      assert.exists(output);
      assert.isEmpty(output);
    });
  });
});
