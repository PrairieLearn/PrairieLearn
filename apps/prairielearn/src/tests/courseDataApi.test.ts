import { afterAll, assert, beforeAll, describe, it, test } from 'vitest';

import { execute } from '@prairielearn/postgres';

import { COURSE_DATA_DATASETS } from '../api/v1/endpoints/courseData/datasets.js';
import { insertCourseAgentConversation } from '../ee/models/course-agent-conversation.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';

import { generateApiToken } from './helperClient.js';
import * as helperExam from './helperExam.js';
import type { TestExamQuestion } from './helperExam.js';
import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';
import { withConfig } from './utils/config.js';

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
};

const SERVICE_TOKEN = 'course-agent-service-token-for-tests-0123456789';

function post(url: string, headers: Record<string, string>, body: unknown = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function getRows(url: string, headers: Record<string, string>, body?: unknown) {
  const res = await post(url, headers, body);
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(res.headers.get('content-type'), 'application/x-ndjson');
  const text = await res.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('course data API', { timeout: 60_000, concurrent: false }, function () {
  let apiUrl: string;
  let token: string;

  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  helperExam.startExam(locals, 'exam1-automaticTestSuite');

  describe('grade a submission so every dataset has rows', function () {
    it('sets up the submission', function () {
      locals.shouldHaveButtons = ['grade', 'save'];
      locals.postAction = 'grade';
      locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
      locals.expectedResult = {
        submission_score: 1,
        submission_correct: true,
        instance_question_points: 5,
        instance_question_score_perc: 100,
        assessment_instance_points: 5,
        assessment_instance_score_perc: (5 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
      };
      locals.getSubmittedAnswer = (variant) => ({ c: variant.true_answer.c });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
  });

  test('every dataset returns rows that match its schema exactly', async function () {
    apiUrl = `${locals.baseUrl}/api/v1/course/1/data`;
    token = await generateApiToken(locals.siteUrl);
    for (const [name, dataset] of Object.entries(COURSE_DATA_DATASETS)) {
      const rows = await getRows(`${apiUrl}/${name}`, { 'Private-Token': token });
      assert.isNotEmpty(rows, name);
      for (const row of rows) dataset.schema.strict().parse(row);
    }
  });

  test('filters, select, order, and limit narrow the rows', async function () {
    const [submission] = await getRows(`${apiUrl}/submissions`, { 'Private-Token': token });
    const rows = await getRows(
      `${apiUrl}/submissions`,
      { 'Private-Token': token },
      {
        filters: [
          { column: 'id', op: 'eq', value: submission.id },
          { column: 'score', op: 'gte', value: 1 },
          { column: 'correct', op: 'eq', value: true },
        ],
        select: ['id', 'score'],
        order: [{ column: 'id', direction: 'desc' }],
        limit: 5,
      },
    );
    assert.deepEqual(rows, [{ id: submission.id, score: 1 }]);

    const none = await getRows(
      `${apiUrl}/submissions`,
      { 'Private-Token': token },
      { filters: [{ column: 'score', op: 'lt', value: 0 }] },
    );
    assert.isEmpty(none);

    const listed = await getRows(
      `${apiUrl}/submissions`,
      { 'Private-Token': token },
      {
        filters: [
          { column: 'id', op: 'in', value: [submission.id, '0'] },
          { column: 'mode', op: 'in', value: [submission.mode, 'SEB'] },
        ],
        select: ['id'],
      },
    );
    assert.deepEqual(listed, [{ id: submission.id }]);
  });

  test('invalid requests explain what is allowed', async function () {
    const cases = [
      ['/missing', {}, 404, 'Unknown dataset "missing"'],
      ['/submissions', { filters: [{ column: 'nope', op: 'eq', value: 1 }] }, 400, '"score"'],
      ['/submissions', { filters: [{ column: 'score', op: 'like', value: 1 }] }, 400, "'in'"],
      ['/submissions', { order: [{ column: 'score; DROP', direction: 'asc' }] }, 400, '"score"'],
      [
        '/submissions',
        { filters: [{ column: 'score', op: 'lt', value: 'abc' }] },
        400,
        'invalid input syntax',
      ],
      ['/submissions', { filters: [{ column: 'id', op: 'in', value: [] }] }, 400, '>=1'],
      [
        '/submissions',
        { filters: [{ column: 'mode', op: 'in', value: ['Exam', 'exam'] }] },
        400,
        'invalid input value for enum',
      ],
    ] as const;
    for (const [path, body, status, message] of cases) {
      const res = await post(apiUrl + path, { 'Private-Token': token }, body);
      assert.equal(res.status, status, path);
      assert.include((await res.json()).message, message);
    }
  });

  test('the course agent reads only its conversation course data, as the user', async function () {
    await withConfig({ isEnterprise: true, courseAgentServiceToken: [SERVICE_TOKEN] }, async () => {
      const conversation = async (user_id: string) => {
        const { agent_conversation_id } = await insertCourseAgentConversation({
          course_id: '1',
          user_id,
          agent_conversation_id: crypto.randomUUID(),
          title: 'Test',
        });
        return {
          Authorization: `Bearer ${SERVICE_TOKEN}`,
          'X-Course-Agent-Conversation': agent_conversation_id,
        };
      };
      const staff = async (uid: string, course_role: 'Owner' | 'Editor') => {
        const user = await insertCoursePermissionsByUserUid({
          course_id: '1',
          uid,
          course_role,
          authn_user_id: '1',
        });
        return await conversation(user.id);
      };
      const owner = await staff('owner@example.com', 'Owner');
      const editor = await staff('editor@example.com', 'Editor');
      // An administrator can use the agent in a course without holding a role in it.
      const adminUser = await getOrCreateUser({
        uid: 'admin@example.com',
        name: 'Admin',
        uin: 'admin',
        email: 'admin@example.com',
      });
      await execute('INSERT INTO administrators (user_id) VALUES ($user_id);', {
        user_id: adminUser.id,
      });
      const admin = await conversation(adminUser.id);
      const statuses = async (headers: Record<string, string>, ...urls: string[]) =>
        Promise.all(urls.map(async (url) => (await post(url, headers)).status));

      assert.isNotEmpty(await getRows(`${apiUrl}/questions`, owner));
      assert.isNotEmpty(await getRows(`${apiUrl}/questions`, admin));
      assert.deepEqual(
        await statuses(
          owner,
          `${locals.baseUrl}/api/v1/course/2/data/questions`,
          `${locals.baseUrl}/api/v1/course_instances/1/assessments`,
        ),
        [403, 403],
      );
      assert.deepEqual(await statuses(editor, `${apiUrl}/questions`), [403]);
      assert.deepEqual(
        await statuses(
          { ...owner, 'X-Course-Agent-Conversation': crypto.randomUUID() },
          `${apiUrl}/questions`,
        ),
        [403],
      );
      assert.deepEqual(
        await statuses({ ...owner, Authorization: 'Bearer wrong' }, `${apiUrl}/questions`),
        [401],
      );
    });
  });
});
