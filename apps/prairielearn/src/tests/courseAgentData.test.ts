import { afterAll, assert, beforeAll, describe, it, test } from 'vitest';

import { execute, loadSqlEquiv } from '@prairielearn/postgres';

import { insertCourseAgentConversation } from '../ee/models/course-agent-conversation.js';
import { COURSE_DATA_DATASETS } from '../ee/routers/courseAgentData/datasets.js';
import { isCourseInstanceRole } from '../lib/authz-data-lib.js';
import { config } from '../lib/config.js';
import { selectOptionalCourseInstanceByShortName } from '../models/course-instances.js';
import {
  deleteCourseInstancePermissions,
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';

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

async function insertStaff(
  uid: string,
  course_role: 'Owner' | 'Editor',
  /** Course instances where the user gets Student Data Viewer. */
  studentDataCourseInstanceIds: string[] = [],
) {
  const user = await insertCoursePermissionsByUserUid({
    course_id: '1',
    uid,
    course_role,
    authn_user_id: '1',
  });
  for (const course_instance_id of studentDataCourseInstanceIds) {
    await insertCourseInstancePermissions({
      course_id: '1',
      course_instance_id,
      user_id: user.id,
      course_instance_role: 'Student Data Viewer',
      authn_user_id: '1',
    });
  }
  return user;
}

async function staffHeaders(...args: Parameters<typeof insertStaff>) {
  const user = await insertStaff(...args);
  return await conversationHeaders(user.id);
}

async function courseInstanceId(shortName: string) {
  const courseInstance = await selectOptionalCourseInstanceByShortName({
    course: { id: '1' },
    shortName,
  });
  assert.isNotNull(courseInstance);
  return courseInstance.id;
}

const STUDENT_DATA_DATASETS = Object.entries(COURSE_DATA_DATASETS)
  .filter(([, dataset]) => dataset.requiredRole.some(isCourseInstanceRole))
  .map(([name]) => name);

describe('course agent course data', { timeout: 60_000, concurrent: false }, function () {
  let dataUrl: string;
  let owner: Record<string, string>;
  // The exam attempt below is in Sp15.
  let sp15Id: string;
  let publicId: string;

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
    sp15Id = await courseInstanceId('Sp15');
    publicId = await courseInstanceId('public');
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
    owner = await staffHeaders('owner@example.com', 'Owner', [sp15Id]);
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
        { column: 'mode', op: 'in', value: [submission.mode, 'Public'] },
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
    assert.isNotEmpty(await getRows(`${dataUrl}/submissions`, admin, body));
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

  test('student data comes only from course instances where the user can see it', async function () {
    const publicOnly = await staffHeaders('public-only@example.com', 'Owner', [publicId]);
    const noStudentData = await staffHeaders('no-student-data@example.com', 'Owner');
    const select = ['course_instance_id'];

    for (const name of STUDENT_DATA_DATASETS) {
      const url = `${dataUrl}/${name}`;
      assert.isNotEmpty(await getRows(url, owner, { select }), name);

      assert.isEmpty(await getRows(url, publicOnly, { select }), name);
      const sp15Filter = [{ column: 'course_instance_id', op: 'eq', value: sp15Id }];
      assert.isEmpty(await getRows(url, publicOnly, { select, filters: sp15Filter }), name);

      const included = await post(url, publicOnly, { select });
      assert.equal(
        included.headers.get('X-Course-Agent-Course-Instances'),
        encodeURIComponent('public: Public'),
        name,
      );

      const refused = await post(url, noStudentData, { select });
      assert.equal(refused.status, 403, name);
      assert.include((await refused.json()).message, 'Student Data Viewer');
    }

    const questions = await post(`${dataUrl}/questions`, noStudentData, { select: ['id'] });
    assert.equal(questions.status, 200);
    assert.isNull(questions.headers.get('X-Course-Agent-Course-Instances'));
  });

  test('a removed student data role applies to the next read', async function () {
    const user = await insertStaff('removed@example.com', 'Owner', [sp15Id]);
    const headers = await conversationHeaders(user.id);
    const body = { select: ['id'] };

    assert.isNotEmpty(await getRows(`${dataUrl}/submissions`, headers, body));
    await deleteCourseInstancePermissions({
      course_id: '1',
      course_instance_id: sp15Id,
      user_id: user.id,
      authn_user_id: '1',
    });
    assert.equal((await post(`${dataUrl}/submissions`, headers, body)).status, 403);
  });
});
