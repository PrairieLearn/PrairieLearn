import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterAll, assert, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { z } from 'zod';

import { CourseActionCatalogSchema } from '@prairielearn/course-agent-types';
import { loadSqlEquiv, queryScalar, queryScalars } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { COURSE_AGENT_ACTIONS } from '../ee/lib/course-agent/actions/index.js';
import { insertCourseAgentConversation } from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import type { CourseAgentConversation, User } from '../lib/db-types.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import { insertCourse, selectCourseById } from '../models/course.js';
import { selectSharingSetsForCourse } from '../models/sharing-set.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import * as helperServer from './helperServer.js';
import { getOrCreateUser, withUser } from './utils/auth.js';
import { withConfig } from './utils/config.js';

const sql = loadSqlEquiv(import.meta.url);

const siteUrl = `http://localhost:${config.serverPort}`;
const actionsUrl = `${siteUrl}/pl/course/1/course_agent/actions`;
const SERVICE_TOKEN = 'course-agent-service-token-for-tests-0123456789';

function createClient(user: User) {
  return createCourseTrpcClient({
    courseId: '1',
    urlBase: siteUrl,
    csrfToken: generatePrefixCsrfToken(
      { url: '/pl/course/1/trpc', authn_user_id: user.id },
      config.secretKey,
    ),
  });
}

function createConversation(user: User) {
  return insertCourseAgentConversation({
    course_id: '1',
    user_id: user.id,
    agent_conversation_id: crypto.randomUUID(),
    title: 'Test conversation',
  });
}

/** Headers of the course agent service acting in this conversation. */
function serviceHeaders(conversation: CourseAgentConversation) {
  return {
    Authorization: `Bearer ${SERVICE_TOKEN}`,
    'X-Course-Agent-Conversation': conversation.agent_conversation_id,
    'Content-Type': 'application/json',
  };
}

function insertIssue({ open = true, course_caused = true, message = 'It is broken.' } = {}) {
  return queryScalar(
    sql.insert_issue,
    { course_id: '1', open, course_caused, student_message: message },
    IdSchema,
  );
}

const issuesOpen = (issue_ids: string[]) =>
  queryScalars(sql.select_issues_open, { issue_ids }, z.boolean());

describe('Course agent actions', { timeout: 60_000 }, () => {
  /** Results PrairieLearn delivered to the course agent service, by request ID. */
  const delivered: { path: string; body: unknown }[] = [];
  const service = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    delivered.push({ path: request.url!, body: JSON.parse(Buffer.concat(chunks).toString()) });
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ outcomeRecorded: true }));
  });
  let owner: User;
  let otherOwner: User;
  let editor: User;
  const originalConfig = {
    isEnterprise: config.isEnterprise,
    courseAgentServiceUrl: config.courseAgentServiceUrl,
    courseAgentServiceToken: config.courseAgentServiceToken,
    features: config.features,
  };

  beforeAll(async () => {
    service.listen(0, '127.0.0.1');
    await once(service, 'listening');
    const address = service.address();
    if (!address || typeof address === 'string') throw new Error('Expected a service TCP address');
    // Enterprise routes must be mounted before starting the test server.
    Object.assign(config, {
      isEnterprise: true,
      courseAgentServiceUrl: `http://127.0.0.1:${address.port}`,
      courseAgentServiceToken: [SERVICE_TOKEN],
      features: { ...config.features, 'course-agent': true, 'question-sharing': true },
    });
    await helperServer.before()();
    [owner, otherOwner, editor] = await Promise.all(
      (
        [
          ['owner@example.com', 'Owner'],
          ['other-owner@example.com', 'Owner'],
          ['editor@example.com', 'Editor'],
        ] as const
      ).map(async ([uid, course_role]) => {
        await getOrCreateUser({ uid, name: uid, uin: uid });
        return await insertCoursePermissionsByUserUid({
          course_id: '1',
          uid,
          course_role,
          authn_user_id: '1',
        });
      }),
    );
  });
  beforeEach(() => {
    delivered.length = 0;
  });
  afterAll(helperServer.after);
  afterAll(async () => {
    service.close();
    await once(service, 'close');
  });
  afterAll(() => Object.assign(config, originalConfig));

  function request(
    conversation: CourseAgentConversation,
    action: string,
    input: unknown,
    id: string = crypto.randomUUID(),
  ) {
    return fetch(`${actionsUrl}/${action}`, {
      method: 'POST',
      headers: serviceHeaders(conversation),
      body: JSON.stringify({ id, input }),
    });
  }

  test('every action and input says what it does', () => {
    for (const [name, action] of Object.entries(COURSE_AGENT_ACTIONS)) {
      assert.match(name, /^[a-z][a-z_]*$/);
      for (const text of [action.group, action.description, action.effects, action.undo ?? '-']) {
        assert.isNotEmpty(text.trim(), name);
      }
      for (const [key, field] of Object.entries(action.input.shape)) {
        assert.isNotEmpty((field as z.ZodType).description?.trim(), `${name}.${key}`);
      }
    }
  });

  test('lists the actions with the schema of each input', async () => {
    const conversation = await createConversation(owner);
    const response = await fetch(actionsUrl, { headers: serviceHeaders(conversation) });
    expect(response.status).toBe(200);
    const catalog = CourseActionCatalogSchema.parse(await response.json());
    expect(Object.keys(catalog.actions)).toEqual(Object.keys(COURSE_AGENT_ACTIONS));
    expect(catalog.actions.issues_close).toMatchObject({
      group: 'issues',
      undo: expect.stringContaining('issues_reopen'),
      input: {
        required: ['issue_ids'],
        // IDs are serialized as strings.
        properties: { issue_ids: { type: 'array', items: { type: 'string' } } },
      },
    });
  });

  test('a request is checked and recorded, and changes nothing until approved', async () => {
    const conversation = await createConversation(owner);
    const issueIds = [
      await insertIssue({ message: 'Wrong answer accepted.' }),
      await insertIssue(),
    ];
    const closed = await insertIssue({ open: false });
    const id = crypto.randomUUID();
    const response = await request(
      conversation,
      'issues_close',
      { issue_ids: [...issueIds, closed] },
      id,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      card: {
        title: 'Close 2 issues',
        context: '1 issue already closed',
        rows: [
          { label: 'addNumbers', detail: 'Wrong answer accepted.' },
          { label: 'addNumbers', detail: 'It is broken.' },
        ],
        moreRows: 0,
        undo: 'Reopen the same issues with issues_reopen.',
      },
    });
    expect(await issuesOpen(issueIds)).toEqual([true, true]);

    // The service repeats a request whose reply it lost; a different request cannot reuse its ID.
    const repeat = await request(
      conversation,
      'issues_close',
      { issue_ids: [...issueIds, closed] },
      id,
    );
    expect(await repeat.json()).toEqual(body);
    expect((await request(conversation, 'issues_close', { issue_ids: issueIds }, id)).status).toBe(
      409,
    );
    expect(
      await queryScalar(
        sql.select_course_agent_action_count,
        { course_agent_conversation_id: conversation.id },
        z.number(),
      ),
    ).toBe(1);

    await withUser(owner, async () => {
      const client = createClient(owner);
      const input = { conversationId: conversation.id, actionId: id };
      expect(await client.courseAgent.getAction.query(input)).toMatchObject({
        card: { title: 'Close 2 issues' },
        decision: null,
        result: null,
      });
      // The chat asks about whatever waits in the review slot.
      expect(
        await client.courseAgent.getReview.query({ conversationId: conversation.id, reviewId: id }),
      ).toEqual({ status: 'action', decision: null, result: null });
    });
  });

  test('requests the course agent cannot make explain why', async () => {
    const conversation = await createConversation(owner);
    const open = await insertIssue();
    const closed = await insertIssue({ open: false });
    const systemCaused = await insertIssue({ course_caused: false });
    const cases = [
      ['missing', { issue_ids: [open] }, 404, 'Actions: issues_close, issues_reopen,'],
      ['issues_close', {}, 400, 'issue_ids'],
      ['issues_close', { issue_ids: [] }, 400, 'issue_ids'],
      ['issues_close', { issue_ids: [open], extra: true }, 400, 'extra'],
      ['issues_close', { issue_ids: [open, '999999'] }, 400, 'no issue with ID 999999'],
      // An issue PrairieLearn caused is not the course's to close.
      ['issues_close', { issue_ids: [systemCaused] }, 400, `no issue with ID ${systemCaused}`],
      ['issues_close', { issue_ids: [closed] }, 400, 'already closed'],
      ['issues_reopen', { issue_ids: [open] }, 400, 'already open'],
    ] as const;
    for (const [action, input, status, message] of cases) {
      const response = await request(conversation, action, input);
      assert.equal(response.status, status, `${action} ${JSON.stringify(input)}`);
      expect((await response.json()).message).toContain(message);
    }
    const malformed = await fetch(`${actionsUrl}/issues_close`, {
      method: 'POST',
      headers: serviceHeaders(conversation),
      body: JSON.stringify({ input: { issue_ids: [open] } }),
    });
    expect(malformed.status).toBe(400);
    expect(await issuesOpen([open, closed])).toEqual([true, false]);
  });

  test('the course agent requests only in its conversation course, as an owner', async () => {
    const conversation = await createConversation(owner);
    const open = await insertIssue();
    const status = async (headers: Record<string, string>, url = `${actionsUrl}/issues_close`) =>
      (
        await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ id: crypto.randomUUID(), input: { issue_ids: [open] } }),
        })
      ).status;
    const headers = serviceHeaders(conversation);
    expect(await status(headers)).toBe(200);
    expect(await status(headers, `${siteUrl}/pl/course/2/course_agent/actions/issues_close`)).toBe(
      403,
    );
    expect(await status(serviceHeaders(await createConversation(editor)))).toBe(403);
    expect(await status({ ...headers, 'X-Course-Agent-Conversation': crypto.randomUUID() })).toBe(
      403,
    );
    expect(await status({ ...headers, Authorization: 'Bearer wrong' })).toBe(401);
    await withConfig({ features: { 'course-agent': false } }, async () => {
      expect(await status(headers)).toBe(403);
    });
    // Without the service token, the route is an ordinary page request with no session.
    const { Authorization: _token, ...sessionless } = headers;
    expect(await status(sessionless)).not.toBe(200);
  });

  test('approving runs the action once, as the instructor, and delivers its result', async () => {
    const conversation = await createConversation(owner);
    const issueIds = [await insertIssue(), await insertIssue()];
    const id = crypto.randomUUID();
    expect((await request(conversation, 'issues_close', { issue_ids: issueIds }, id)).status).toBe(
      200,
    );
    const decide = { conversationId: conversation.id, reviewId: id };
    await withUser(otherOwner, async () => {
      // Another owner of the course cannot decide a request in someone else's conversation.
      await expect(
        createClient(otherOwner).courseAgent.postReviewDecision.mutate({
          ...decide,
          decision: 'approved',
        }),
      ).rejects.toMatchObject({ data: { code: 'NOT_FOUND' } });
    });
    expect(await issuesOpen(issueIds)).toEqual([true, true]);

    await withUser(owner, async () => {
      const client = createClient(owner);
      // Two clicks, or two tabs, approve at once.
      const decisions = await Promise.all([
        client.courseAgent.postReviewDecision.mutate({ ...decide, decision: 'approved' }),
        client.courseAgent.postReviewDecision.mutate({ ...decide, decision: 'approved' }),
      ]);
      expect(decisions).toEqual([{ decision: 'approved' }, { decision: 'approved' }]);
      await expect(
        client.courseAgent.postReviewDecision.mutate({ ...decide, decision: 'denied' }),
      ).rejects.toMatchObject({ data: { httpStatus: 409 } });
      const result = {
        decision: 'approved',
        action: { name: 'issues_close', title: 'Close 2 issues' },
        outcome: { status: 'succeeded', summary: 'Closed 2 issues.' },
      };
      expect(
        await client.courseAgent.getAction.query({ conversationId: conversation.id, actionId: id }),
      ).toMatchObject({ decision: 'approved', result });
      expect(delivered).toEqual([
        {
          path: `/conversations/${conversation.agent_conversation_id}/reviews/${id}/outcome`,
          body: result,
        },
      ]);
    });
    expect(await issuesOpen(issueIds)).toEqual([false, false]);
    // Each issue is logged once, as the instructor's change.
    expect(
      await queryScalar(
        sql.select_issue_audit_log_count,
        { issue_ids: issueIds, authn_user_id: owner.id },
        z.number(),
      ),
    ).toBe(2);
  });

  test('reopening undoes closing', async () => {
    const conversation = await createConversation(owner);
    const issueIds = [await insertIssue({ open: false })];
    const id = crypto.randomUUID();
    const response = await request(conversation, 'issues_reopen', { issue_ids: issueIds }, id);
    expect(await response.json()).toMatchObject({ card: { title: 'Reopen 1 issue' } });
    await withUser(owner, async () => {
      await createClient(owner).courseAgent.postReviewDecision.mutate({
        conversationId: conversation.id,
        reviewId: id,
        decision: 'approved',
      });
    });
    expect(await issuesOpen(issueIds)).toEqual([true]);
    expect(delivered[0].body).toMatchObject({
      outcome: { status: 'succeeded', summary: 'Reopened 1 issue.' },
    });
  });

  test('denying changes nothing, including when the instructor denies by sending a message', async () => {
    const conversation = await createConversation(owner);
    const issueIds = [await insertIssue()];
    const denied = crypto.randomUUID();
    const deniedByMessage = crypto.randomUUID();
    await request(conversation, 'issues_close', { issue_ids: issueIds }, denied);
    await request(conversation, 'issues_close', { issue_ids: issueIds }, deniedByMessage);
    await withUser(owner, async () => {
      const client = createClient(owner);
      await client.courseAgent.postReviewDecision.mutate({
        conversationId: conversation.id,
        reviewId: denied,
        decision: 'denied',
      });
      await client.courseAgent.postReviewDecision.mutate({
        conversationId: conversation.id,
        reviewId: deniedByMessage,
        decision: 'denied',
        viaMessage: true,
      });
      await expect(
        client.courseAgent.postReviewDecision.mutate({
          conversationId: conversation.id,
          reviewId: denied,
          decision: 'approved',
        }),
      ).rejects.toMatchObject({ data: { httpStatus: 409 } });
    });
    expect(await issuesOpen(issueIds)).toEqual([true]);
    const result = {
      decision: 'denied',
      action: { name: 'issues_close', title: 'Close 1 issue' },
      outcome: { status: 'not_attempted' },
    };
    expect(delivered.map(({ body }) => body)).toEqual([result, { ...result, viaMessage: true }]);
  });

  test('shares a sharing set with the course a sharing token names, once', async () => {
    const conversation = await createConversation(owner);
    const consumer = await insertCourse({
      institution_id: '1',
      short_name: 'SHARE 101',
      title: 'A course that uses shared questions',
      display_timezone: 'America/Chicago',
      path: `/course-${crypto.randomUUID()}`,
      repository: null,
      branch: 'master',
      authn_user_id: '1',
    });
    await queryScalar(sql.insert_sharing_set, { course_id: '1', name: 'intro-set' }, IdSchema);
    const input = { sharing_set_name: 'intro-set', course_sharing_token: consumer.sharing_token };
    const ownToken = (await selectCourseById('1')).sharing_token;
    const cases = [
      [
        { ...input, sharing_set_name: 'missing' },
        'no sharing set named "missing". Its sharing sets:',
      ],
      [{ ...input, course_sharing_token: crypto.randomUUID() }, 'No course has that sharing token'],
      [{ ...input, course_sharing_token: ownToken }, "this course's own sharing token"],
    ] as const;
    for (const [refused, message] of cases) {
      const response = await request(conversation, 'sharing_add_course_to_set', refused);
      assert.equal(response.status, 400, message);
      expect((await response.json()).message).toContain(message);
    }

    const id = crypto.randomUUID();
    const response = await request(conversation, 'sharing_add_course_to_set', input, id);
    const { card } = await response.json();
    expect(card).toEqual({
      title: 'Share the sharing set "intro-set" with SHARE 101',
      context: 'PrairieLearn has no way to take this access back.',
      rows: [
        { label: 'SHARE 101: A course that uses shared questions', detail: 'Gets access' },
        { label: 'Sharing set "intro-set"', detail: '0 questions' },
      ],
      moreRows: 0,
      undo: null,
    });
    // The token identifies the other course to PrairieLearn; the instructor is not shown it.
    expect(JSON.stringify(card)).not.toContain(consumer.sharing_token);
    const sharedWith = async () =>
      (await selectSharingSetsForCourse({ course_id: '1' })).find(
        ({ name }) => name === 'intro-set',
      )?.shared_with;
    expect(await sharedWith()).toEqual([]);
    await withUser(owner, async () => {
      await createClient(owner).courseAgent.postReviewDecision.mutate({
        conversationId: conversation.id,
        reviewId: id,
        decision: 'approved',
      });
    });
    expect(await sharedWith()).toEqual(['SHARE 101']);
    expect(delivered[0].body).toMatchObject({
      outcome: {
        status: 'succeeded',
        summary: 'Shared the sharing set "intro-set" with SHARE 101.',
      },
    });
    const again = await request(conversation, 'sharing_add_course_to_set', input);
    expect((await again.json()).message).toContain('already shared with SHARE 101');
  });

  test('sets the sharing name and replaces the sharing token', async () => {
    const conversation = await createConversation(owner);
    const approve = async (action: string, input: unknown) => {
      const id = crypto.randomUUID();
      const response = await request(conversation, action, input, id);
      assert.equal(response.status, 200, await response.clone().text());
      await withUser(owner, async () => {
        await createClient(owner).courseAgent.postReviewDecision.mutate({
          conversationId: conversation.id,
          reviewId: id,
          decision: 'approved',
        });
      });
      return (await response.json()).card;
    };
    const named = await approve('sharing_choose_name', { sharing_name: 'test-course' });
    expect(named).toMatchObject({
      title: 'Set the course\'s sharing name to "test-course"',
      rows: [{ label: 'Sharing name now', detail: 'None' }],
    });
    expect((await selectCourseById('1')).sharing_name).toBe('test-course');
    const sameName = await request(conversation, 'sharing_choose_name', {
      sharing_name: 'test-course',
    });
    expect((await sameName.json()).message).toContain('already "test-course"');
    const badName = await request(conversation, 'sharing_choose_name', { sharing_name: 'a/b' });
    expect(badName.status).toBe(400);

    const before = (await selectCourseById('1')).sharing_token;
    const replaced = await approve('sharing_regenerate_token', {});
    expect(replaced).toMatchObject({ title: "Replace this course's sharing token", undo: null });
    const after = (await selectCourseById('1')).sharing_token;
    expect(after).not.toBe(before);
    // The new token is the instructor's to hand out, so the agent is not sent it.
    expect(JSON.stringify(delivered.at(-1))).not.toContain(after);

    await withConfig(
      { features: { 'course-agent': true, 'question-sharing': false } },
      async () => {
        const unavailable = await request(conversation, 'sharing_regenerate_token', {});
        expect(unavailable.status).toBe(400);
        expect((await unavailable.json()).message).toContain('not available in this course');
      },
    );
  });

  test('an approval that finds nothing left to do says so', async () => {
    const conversation = await createConversation(owner);
    const issueIds = [await insertIssue()];
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    await request(conversation, 'issues_close', { issue_ids: issueIds }, first);
    await request(conversation, 'issues_close', { issue_ids: issueIds }, second);
    await withUser(owner, async () => {
      const client = createClient(owner);
      for (const reviewId of [first, second]) {
        await client.courseAgent.postReviewDecision.mutate({
          conversationId: conversation.id,
          reviewId,
          decision: 'approved',
        });
      }
    });
    expect(delivered.map(({ body }) => body)).toMatchObject([
      { outcome: { status: 'succeeded', summary: 'Closed 1 issue.' } },
      {
        outcome: {
          status: 'succeeded',
          summary: 'Nothing changed: the issues were already closed.',
        },
      },
    ]);
  });
});
