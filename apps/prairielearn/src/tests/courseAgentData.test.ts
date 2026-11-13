import { afterAll, assert, beforeAll, describe, it, test } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { insertCourseAgentConversation } from '../ee/models/course-agent-conversation.js';
import { COURSE_DATA_DATASETS } from '../ee/routers/courseAgentData/datasets.js';
import { config } from '../lib/config.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';

import * as helperExam from './helperExam.js';
import type { TestExamQuestion } from './helperExam.js';
import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';
import { withConfig } from './utils/config.js';

const sql = loadSqlEquiv(import.meta.url);

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
  variant: { true_answer: { c: number } };
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

async function getRows(url: string, headers: Record<string, string>, body: unknown) {
  const res = await post(url, headers, body);
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(res.headers.get('content-type'), 'application/x-ndjson');
  const text = await res.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Headers for the course agent service acting in a new conversation of this user. */
async function conversationHeaders(user_id: string) {
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
}

async function staffHeaders(uid: string, course_role: 'Owner' | 'Editor') {
  const user = await insertCoursePermissionsByUserUid({
    course_id: '1',
    uid,
    course_role,
    authn_user_id: '1',
  });
  return await conversationHeaders(user.id);
}

describe('course agent course data', { timeout: 60_000, concurrent: false }, function () {
  let dataUrl: string;
  let owner: Record<string, string>;

  const originalConfig = {
    isEnterprise: config.isEnterprise,
    courseAgentServiceUrl: config.courseAgentServiceUrl,
    courseAgentServiceToken: config.courseAgentServiceToken,
    features: config.features,
  };

  beforeAll(async () => {
    // Enterprise routes must be mounted before starting the test server.
    Object.assign(config, {
      isEnterprise: true,
      courseAgentServiceUrl: 'http://course-agent.test',
      courseAgentServiceToken: [SERVICE_TOKEN],
      features: { ...config.features, 'course-agent': true },
    });
    await helperServer.before()();
  });

  afterAll(helperServer.after);
  afterAll(() => {
    Object.assign(config, originalConfig);
  });

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
    dataUrl = `${locals.baseUrl}/course/1/course_agent/data`;
    owner = await staffHeaders('owner@example.com', 'Owner');
    for (const [name, dataset] of Object.entries(COURSE_DATA_DATASETS)) {
      const rows = await getRows(`${dataUrl}/${name}`, owner, {
        select: Object.keys(dataset.schema.shape),
      });
      assert.isNotEmpty(rows, name);
      for (const row of rows) dataset.schema.strict().parse(row);
    }
  });

  test('filters, select, order, and limit narrow the rows', async function () {
    const [submission] = await getRows(`${dataUrl}/submissions`, owner, {
      select: ['id', 'mode', 'submitted_answer'],
    });
    assert.deepEqual(submission.submitted_answer, { c: locals.variant.true_answer.c });
    const rows = await getRows(`${dataUrl}/submissions`, owner, {
      filters: [
        { column: 'id', op: 'eq', value: submission.id },
        { column: 'score', op: 'gte', value: 1 },
        { column: 'correct', op: 'eq', value: true },
      ],
      select: ['id', 'score'],
      order: [{ column: 'id', direction: 'desc' }],
      limit: 5,
    });
    assert.deepEqual(rows, [{ id: submission.id, score: 1 }]);

    const none = await getRows(`${dataUrl}/submissions`, owner, {
      filters: [{ column: 'score', op: 'lt', value: 0 }],
      select: ['id'],
    });
    assert.isEmpty(none);

    const listed = await getRows(`${dataUrl}/submissions`, owner, {
      filters: [
        { column: 'id', op: 'in', value: [submission.id, '0'] },
        { column: 'mode', op: 'in', value: [submission.mode, 'SEB'] },
      ],
      select: ['id'],
    });
    assert.deepEqual(listed, [{ id: submission.id }]);
  });

  test('invalid requests explain what is allowed', async function () {
    const select = ['id'];
    const cases = [
      ['/missing', { select }, 404, 'Unknown dataset "missing"'],
      ['/submissions', {}, 400, 'select'],
      [
        '/submissions',
        { select, filters: [{ column: 'nope', op: 'eq', value: 1 }] },
        400,
        '"score"',
      ],
      [
        '/submissions',
        { select, filters: [{ column: 'score', op: 'like', value: 1 }] },
        400,
        "'in'",
      ],
      [
        '/submissions',
        { select, order: [{ column: 'score; DROP', direction: 'asc' }] },
        400,
        '"score"',
      ],
      [
        '/submissions',
        { select, filters: [{ column: 'score', op: 'lt', value: 'abc' }] },
        400,
        'invalid input syntax',
      ],
      ['/submissions', { select, filters: [{ column: 'id', op: 'in', value: [] }] }, 400, '>=1'],
      [
        '/submissions',
        { select, filters: [{ column: 'mode', op: 'in', value: ['Exam', 'exam'] }] },
        400,
        'invalid input value for enum',
      ],
    ] as const;
    for (const [path, body, status, message] of cases) {
      const res = await post(dataUrl + path, owner, body);
      assert.equal(res.status, status, path);
      assert.include((await res.json()).message, message);
    }
  });

  test('the course agent reads only its conversation course data, as the user', async function () {
    const editor = await staffHeaders('editor@example.com', 'Editor');
    // An administrator can use the agent in a course without holding a role in it.
    const adminUser = await getOrCreateUser({
      uid: 'admin@example.com',
      name: 'Admin',
      uin: 'admin',
      email: 'admin@example.com',
    });
    await execute(sql.insert_administrator, { user_id: adminUser.id });
    const admin = await conversationHeaders(adminUser.id);
    const body = { select: ['id'] };
    const status = async (headers: Record<string, string>, url = `${dataUrl}/questions`) =>
      (await post(url, headers, body)).status;

    assert.isNotEmpty(await getRows(`${dataUrl}/questions`, owner, body));
    assert.isNotEmpty(await getRows(`${dataUrl}/questions`, admin, body));
    assert.equal(
      await status(owner, `${locals.baseUrl}/course/2/course_agent/data/questions`),
      403,
    );
    assert.equal(await status(editor), 403);
    assert.equal(
      await status({ ...owner, 'X-Course-Agent-Conversation': crypto.randomUUID() }),
      403,
    );
    assert.equal(await status({ ...owner, Authorization: 'Bearer wrong' }), 401);
    await withConfig({ features: { 'course-agent': false } }, async () => {
      assert.equal(await status(owner), 403);
    });
  });
});
