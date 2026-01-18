import fetch from 'node-fetch';
import { afterAll, assert, beforeAll, describe, it, test } from 'vitest';

import { config } from '../lib/config.js';

import { generateApiToken } from './helperClient.js';
import { createCourseRepoFixture, updateCourseRepository } from './helperCourse.js';
import * as helperExam from './helperExam.js';
import type { TestExamQuestion } from './helperExam.js';
import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';
import * as syncUtil from './sync/util.js';

const locals = {} as {
  shouldHaveButtons: string[];
  postAction: string;
  question: TestExamQuestion;
  expectedResult: {
    submission_score: number;
    submission_correct: boolean;
    instance_question_points: number;
    instance_question_score_perc: number;
    assessment_instance_points: number;
    assessment_instance_score_perc: number;
  };
  getSubmittedAnswer: (variant: any) => object;
  siteUrl: string;
  baseUrl: string;
  apiToken: string;
  assessmentId: string;
  apiUrl: string;
  apiCourseInstanceUrl: string;
  apiPublicCourseInstanceUrl: string;
  apiAssessmentsUrl: string;
  apiAssessmentUrl: string;
  apiAssessmentInstancesUrl: string;
  apiAssessmentInstanceUrl: string;
  apiSubmissionsUrl: string;
  apiSubmissionUrl: string;
  apiGradebookUrl: string;
  apiInstanceQuestionUrl: string;
  apiAssessmentInstanceLogUrl: string;
  apiAssessmentAccessRulesUrl: string;
  apiCourseInstanceAccessRulesUrl: string;
  apiCourseInstanceInfoUrl: string;
  assessmentInstanceId: string;
  submissionId: string;
};

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
    it('generates a token', async function () {
      // The helper validates page structure, form elements, and token format
      // Note: generateApiToken expects the site URL without /pl suffix
      locals.apiToken = await generateApiToken(locals.siteUrl);

      // Ensure that the token is not displayed after reloading the page.
      const res = await fetch(locals.baseUrl + '/settings');
      assert.isTrue(res.ok);
      const pageContent = await res.text();
      assert.isFalse(pageContent.includes(locals.apiToken));
    });
  });

  describe('API endpoints', function () {
    test.sequential('GET to API for assessments fails without token', async function () {
      locals.apiUrl = locals.baseUrl + '/api/v1';
      locals.apiCourseInstanceUrl = locals.apiUrl + '/course_instances/1';
      locals.apiPublicCourseInstanceUrl = locals.apiUrl + '/course_instances/2';
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
            'Private-Token': locals.apiToken,
          },
        });
        assert.equal(res.status, 200);

        const json = (await res.json()) as any;

        const assessment = json.find((o: any) => o.assessment_name === 'exam1-automaticTestSuite');
        assert.exists(assessment);
        assert.equal(assessment.assessment_label, 'E1');

        // Persist the assessment ID for later requests
        locals.assessmentId = assessment.assessment_id;
      },
    );

    test.sequential('GET to API for single assessment succeeds', async function () {
      locals.apiAssessmentUrl = locals.apiCourseInstanceUrl + `/assessments/${locals.assessmentId}`;

      const res = await fetch(locals.apiAssessmentUrl, {
        headers: {
          'Private-Token': locals.apiToken,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;

      assert.equal(json.assessment_id, locals.assessmentId);
      assert.equal(json.assessment_label, 'E1');
    });

    test.sequential('GET to API for assessment instances succeeds', async function () {
      locals.apiAssessmentInstancesUrl =
        locals.apiCourseInstanceUrl + `/assessments/${locals.assessmentId}/assessment_instances`;

      const res = await fetch(locals.apiAssessmentInstancesUrl, {
        headers: {
          'Private-Token': locals.apiToken,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      const assessmentInstance = json[0];
      assert.equal(assessmentInstance.user_uid, 'dev@example.com');
      assert.equal(assessmentInstance.points, assessmentPoints);
      assert.equal(assessmentInstance.max_points, helperExam.exam1AutomaticTestSuite.maxPoints);

      // Persist the assessment instance ID for later requests
      locals.assessmentInstanceId = assessmentInstance.assessment_instance_id;
    });

    test.sequential('GET to API for a single assessment instance succeeds', async function () {
      locals.apiAssessmentInstanceUrl =
        locals.apiCourseInstanceUrl + `/assessment_instances/${locals.assessmentInstanceId}`;

      const res = await fetch(locals.apiAssessmentInstanceUrl, {
        headers: {
          'Private-Token': locals.apiToken,
        },
      });

      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.equal(json.assessment_instance_id, locals.assessmentInstanceId);
      assert.equal(json.assessment_id, locals.assessmentId);
      assert.equal(json.user_uid, 'dev@example.com');
      assert.equal(json.points, assessmentPoints);
      assert.equal(json.max_points, helperExam.exam1AutomaticTestSuite.maxPoints);
    });

    test.sequential('GET to API for assessment submissions succeeds', async function () {
      locals.apiSubmissionsUrl =
        locals.apiCourseInstanceUrl +
        `/assessment_instances/${locals.assessmentInstanceId}/submissions`;

      const res = await fetch(locals.apiSubmissionsUrl, {
        headers: {
          'Private-Token': locals.apiToken,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.lengthOf(json, 1);
      assert.equal(json[0].instance_question_points, assessmentPoints);

      // Persist the submission ID for later requests
      locals.submissionId = json[0].submission_id;
    });

    test.sequential('GET to API for single submission succeeds', async function () {
      locals.apiSubmissionUrl = locals.apiCourseInstanceUrl + `/submissions/${locals.submissionId}`;

      const res = await fetch(locals.apiSubmissionUrl, {
        headers: {
          'Private-Token': locals.apiToken,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.equal(json.submission_id, locals.submissionId);
      assert.equal(json.assessment_instance_id, locals.assessmentInstanceId);
      assert.equal(json.assessment_id, locals.assessmentId);
      assert.equal(json.instance_question_points, assessmentPoints);
    });

    test.sequential('GET to API for gradebook', async function () {
      locals.apiGradebookUrl = locals.apiCourseInstanceUrl + '/gradebook';
      const res = await fetch(locals.apiGradebookUrl, {
        headers: {
          'Private-Token': locals.apiToken,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      const user = json.find((o: any) => o.user_uid === 'dev@example.com');
      assert.exists(user);
      const assessment = user.assessments.find((o: any) => o.assessment_label === 'E1');
      assert.exists(assessment);
      assert.equal(assessment.points, assessmentPoints);
      assert.equal(assessment.max_points, helperExam.exam1AutomaticTestSuite.maxPoints);
    });

    test.sequential('GET to API for assessment instance questions succeeds', async function () {
      locals.apiInstanceQuestionUrl =
        locals.apiCourseInstanceUrl +
        `/assessment_instances/${locals.assessmentInstanceId}/instance_questions`;

      const res = await fetch(locals.apiInstanceQuestionUrl, {
        headers: {
          'Private-Token': locals.apiToken,
        },
      });

      const json = (await res.json()) as any;
      assert.lengthOf(json, 7);
    });

    test.sequential('GET to API for assessment instance log succeeds', async function () {
      locals.apiAssessmentInstanceLogUrl =
        locals.apiCourseInstanceUrl + `/assessment_instances/${locals.assessmentInstanceId}/log`;

      const res = await fetch(locals.apiAssessmentInstanceLogUrl, {
        headers: {
          'Private-Token': locals.apiToken,
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
            'Private-Token': locals.apiToken,
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
            'Private-Token': locals.apiToken,
          },
        });
        assert.equal(res.status, 404);

        const json = (await res.json()) as any;
        assert.equal(json.message, 'Not Found');
      },
    );

    test.sequential('GET to API for assessment access rules succeeds', async function () {
      locals.apiAssessmentAccessRulesUrl =
        locals.apiCourseInstanceUrl + `/assessments/${locals.assessmentId}/assessment_access_rules`;

      const res = await fetch(locals.apiAssessmentAccessRulesUrl, {
        headers: {
          'Private-Token': locals.apiToken,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.lengthOf(json, 1);
    });

    test.sequential('GET to API for course instance access rules succeeds', async function () {
      locals.apiCourseInstanceAccessRulesUrl =
        locals.apiPublicCourseInstanceUrl + '/course_instance_access_rules';
      const res = await fetch(locals.apiCourseInstanceAccessRulesUrl, {
        headers: {
          'Private-Token': locals.apiToken,
        },
      });
      assert.equal(res.status, 200);

      const json = (await res.json()) as any;
      assert.lengthOf(json, 1);
    });

    test.sequential('GET to API for course instance info succeeds', async function () {
      const res = await fetch(locals.apiCourseInstanceUrl, {
        headers: {
          'Private-Token': locals.apiToken,
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
          'Private-Token': locals.apiToken,
          Cookie: 'pl_test_mode=Exam',
        },
      });
      assert.equal(res.status, 403);
    });
  });
});

// Isolated describe block for API sync tests with dedicated git repository
describe('API course sync', { timeout: 60_000 }, function () {
  const baseUrl = 'http://localhost:' + config.serverPort;
  const apiUrl = baseUrl + '/pl/api/v1';
  let syncTestCourseId: string;
  let apiCourseSyncUrl: string;
  let courseSyncJobSequenceId: string;
  let apiToken: string;

  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  beforeAll(async () => {
    apiToken = await generateApiToken(baseUrl, 'sync-test');

    const fixture = await createCourseRepoFixture({
      populateOrigin: async (originDir) => {
        const courseData = syncUtil.getCourseData();
        courseData.course.name = 'API Sync Test Course';
        await syncUtil.writeCourseToDirectory(courseData, originDir);
      },
    });

    // Sync the live directory to the database
    const syncResults = await syncUtil.syncCourseData(fixture.courseLiveDir);
    syncTestCourseId = syncResults.courseId;

    // Update repository field to point to origin
    await updateCourseRepository({
      courseId: syncTestCourseId,
      repository: fixture.courseOriginDir,
    });
  });

  test.sequential('POST to API to start a course sync', async function () {
    apiCourseSyncUrl = apiUrl + '/course/' + syncTestCourseId + '/sync';
    const res = await fetch(apiCourseSyncUrl, {
      method: 'POST',
      headers: {
        'Private-Token': apiToken,
      },
    });
    assert.equal(res.status, 200);

    const json = (await res.json()) as any;
    assert.exists(json.job_sequence_id);
    courseSyncJobSequenceId = json.job_sequence_id;
  });

  test.sequential('GET to API for course sync status info succeeds', async function () {
    // Wait for job to complete before checking status
    await helperServer.waitForJobSequence(courseSyncJobSequenceId);

    const apiCourseSyncJobUrl = apiCourseSyncUrl + '/' + courseSyncJobSequenceId;
    const res = await fetch(apiCourseSyncJobUrl, {
      headers: {
        'Private-Token': apiToken,
      },
    });
    assert.equal(res.status, 200);

    const json = (await res.json()) as any;
    assert.exists(json.job_sequence_id);
    assert.equal(json.job_sequence_id, courseSyncJobSequenceId);
    assert.exists(json.status);
    assert.exists(json.start_date);
    assert.exists(json.finish_date);
    assert.exists(json.output);
  });

  test.sequential(
    'GET to API for course sync status info fails with invalid job_sequence_id',
    async function () {
      const apiCourseSyncJobUrl = apiCourseSyncUrl + '/NA';
      const res = await fetch(apiCourseSyncJobUrl, {
        headers: {
          'Private-Token': apiToken,
        },
      });
      assert.equal(res.status, 404);
    },
  );
});
