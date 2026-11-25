import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterAll, assert, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import { CourseActionCatalogSchema } from '@prairielearn/course-agent-types';
import { loadSqlEquiv, queryRow, queryScalar, queryScalars } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { action } from '../ee/lib/course-agent/actions/action.js';
import { COURSE_AGENT_ACTIONS } from '../ee/lib/course-agent/actions/index.js';
import { insertCourseAgentConversation } from '../ee/models/course-agent-conversation.js';
import { constructCourseOrInstanceContext } from '../lib/authz-data.js';
import { config } from '../lib/config.js';
import type { CourseAgentConversation, User } from '../lib/db-types.js';
import { insertCoursePermissionsByUserUid } from '../models/course-permissions.js';
import { selectCourseById } from '../models/course.js';
import { updateIssueOpen } from '../models/issue.js';
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
      features: { ...config.features, 'course-agent': true },
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

  /** An approval's result is sent to the service after the approval request answers. */
  const waitForDeliveries = (count: number) =>
    vi.waitFor(() => expect(delivered).toHaveLength(count));
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
      assert.isNotEmpty(action.description.trim(), name);
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
    // The agent is told what it asked for. The rows are course data, which only the card shows.
    expect(await response.json()).toEqual({ title: 'Close 2 issues' });
    expect(await issuesOpen(issueIds)).toEqual([true, true]);

    await withUser(owner, async () => {
      const client = createClient(owner);
      // The card and the chat read the request with the same query.
      const input = { conversationId: conversation.id, reviewId: id };
      expect(await client.courseAgent.getReview.query(input)).toEqual({
        status: 'action',
        card: {
          icon: 'check-circle',
          tone: 'positive',
          title: 'Close 2 issues',
          subtitle: '1 other issue already closed',
          // Each issue links to the Issues page, searched for its question.
          items: issueIds.map((issueId) => ({
            label: `#${issueId} addNumbers`,
            href: '/pl/course/1/course_admin/issues?q=qid%3AaddNumbers',
          })),
        },
        decision: null,
        result: null,
      });
    });
  });

  test('requests the course agent cannot make explain why', async () => {
    const conversation = await createConversation(owner);
    const open = await insertIssue();
    const closed = await insertIssue({ open: false });
    const systemCaused = await insertIssue({ course_caused: false });
    const cases = [
      ['missing', { issue_ids: [open] }, 404, 'Actions: issues_close, issues_reopen'],
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

  /** The context an action runs in, for the owner acting in the given course role. */
  async function actionContext(course_role: 'Owner' | 'Viewer') {
    const { authzData } = await constructCourseOrInstanceContext({
      user: owner,
      course_id: '1',
      course_instance_id: null,
      ip: null,
      req_date: new Date(),
      is_administrator: false,
      // The mode is otherwise found from the IP address of a request.
      overrides: { course_role, mode: 'Public' },
    });
    assert(authzData);
    return { course: await selectCourseById('1'), user: owner, authz_data: authzData };
  }

  test('a run that fails leaves nothing changed', async () => {
    const open = await insertIssue();
    const closesThenFails = action({
      group: 'issues',
      icon: 'check-circle',
      tone: 'positive',
      description: 'Close an issue, then fail.',
      requiredRole: ['Editor'],
      input: z.strictObject({}),
      describe: async () => ({ title: 'Close an issue', items: [] }),
      run: async ({ ctx }) => {
        await updateIssueOpen({
          issue_id: open,
          open: false,
          course_id: ctx.course.id,
          authn_user_id: ctx.user.id,
        });
        return { status: 'failed', error: 'The second step could not be done.' };
      },
    });
    await expect(closesThenFails.run(await actionContext('Owner'), {})).rejects.toThrow(
      'The second step could not be done.',
    );
    expect(await issuesOpen([open])).toEqual([true]);
  });

  test('an instructor acting in a role below the one an action needs is refused', async () => {
    const open = await insertIssue();
    // An owner viewing the course as a Viewer has a Viewer's permissions.
    const ctx = await actionContext('Viewer');
    await expect(
      COURSE_AGENT_ACTIONS.issues_close.describe(ctx, { issue_ids: [open] }),
    ).rejects.toThrow('The instructor needs Editor access to the course');
    await expect(COURSE_AGENT_ACTIONS.issues_close.run(ctx, { issue_ids: [open] })).rejects.toThrow(
      'The instructor needs Editor access to the course',
    );
    expect(await issuesOpen([open])).toEqual([true]);
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
    // Without the service token, the request has no session and is not authenticated.
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
        await client.courseAgent.getReview.query({ conversationId: conversation.id, reviewId: id }),
      ).toMatchObject({ status: 'action', decision: 'approved', result });
      await waitForDeliveries(1);
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

  test('an automatic approval runs the action as the owner, with no browser involved', async () => {
    const conversation = await createConversation(owner);
    const issueIds = [await insertIssue()];
    const id = crypto.randomUUID();
    expect((await request(conversation, 'issues_close', { issue_ids: issueIds }, id)).status).toBe(
      200,
    );
    const response = await fetch(
      `${siteUrl}/pl/api/course-agent/conversations/${conversation.agent_conversation_id}/reviews/${id}/approve`,
      { method: 'POST', headers: serviceHeaders(conversation), body: '{}' },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ decision: 'approved' });
    expect(await issuesOpen(issueIds)).toEqual([false]);
    await waitForDeliveries(1);
    expect(delivered[0]).toMatchObject({
      path: `/conversations/${conversation.agent_conversation_id}/reviews/${id}/outcome`,
      body: { decision: 'approved', outcome: { status: 'succeeded' } },
    });
    expect(
      await queryScalar(
        sql.select_issue_audit_log_count,
        { issue_ids: issueIds, authn_user_id: owner.id },
        z.number(),
      ),
    ).toBe(1);
  });

  test('reopening undoes closing', async () => {
    const conversation = await createConversation(owner);
    const issueIds = [await insertIssue({ open: false })];
    const id = crypto.randomUUID();
    const response = await request(conversation, 'issues_reopen', { issue_ids: issueIds }, id);
    expect(await response.json()).toEqual({ title: `Reopen issue #${issueIds[0]}` });
    await withUser(owner, async () => {
      await createClient(owner).courseAgent.postReviewDecision.mutate({
        conversationId: conversation.id,
        reviewId: id,
        decision: 'approved',
      });
    });
    expect(await issuesOpen(issueIds)).toEqual([true]);
    await waitForDeliveries(1);
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
      action: { name: 'issues_close', title: `Close issue #${issueIds[0]}` },
      outcome: { status: 'not_attempted' },
    };
    await waitForDeliveries(2);
    expect(delivered.map(({ body }) => body)).toEqual([result, { ...result, viaMessage: true }]);
  });

  test('reports an issue on a question version, as the "Report an issue" button does', async () => {
    const conversation = await createConversation(owner);
    const variantId = await queryScalar(
      sql.insert_preview_variant,
      { user_id: owner.id },
      IdSchema,
    );
    const input = { variant_id: variantId, description: 'The figure does not load.' };
    expect(
      (
        await (
          await request(conversation, 'issues_report', { ...input, variant_id: '999999' })
        ).json()
      ).message,
    ).toContain('no question version with ID 999999');
    const id = crypto.randomUUID();
    const response = await request(conversation, 'issues_report', input, id);
    expect(await response.json()).toEqual({ title: 'Report an issue on addNumbers' });
    await withUser(owner, async () => {
      const client = createClient(owner);
      expect(
        await client.courseAgent.getReview.query({ conversationId: conversation.id, reviewId: id }),
      ).toMatchObject({
        card: {
          title: 'Report an issue on addNumbers',
          subtitle: '"The figure does not load."',
          items: [
            {
              label: `addNumbers, version ${variantId}`,
              href: expect.stringMatching(
                new RegExp(`^/pl/course/1/question/\\d+/\\?variant_id=${variantId}$`),
              ),
            },
          ],
        },
      });
      await client.courseAgent.postReviewDecision.mutate({
        conversationId: conversation.id,
        reviewId: id,
        decision: 'approved',
      });
    });
    await waitForDeliveries(1);
    const summary = (delivered[0].body as { outcome: { summary: string } }).outcome.summary;
    const issueId = /^Reported issue #(\d+)\.$/.exec(summary)![1];
    expect(
      await queryRow(
        sql.select_issue,
        { issue_id: issueId },
        z.object({
          variant_id: IdSchema,
          open: z.boolean(),
          manually_reported: z.boolean(),
          course_caused: z.boolean(),
          student_message: z.string(),
          instructor_message: z.string(),
          user_id: IdSchema,
          authn_user_id: IdSchema,
        }),
      ),
    ).toEqual({
      variant_id: variantId,
      open: true,
      manually_reported: true,
      course_caused: true,
      student_message: 'The figure does not load.',
      instructor_message: 'instructor-reported issue',
      user_id: owner.id,
      authn_user_id: owner.id,
    });
  });

  test('an approval is refused when the course changed since the request', async () => {
    const conversation = await createConversation(owner);
    const issueIds = [await insertIssue(), await insertIssue()];
    const id = crypto.randomUUID();
    await request(conversation, 'issues_close', { issue_ids: issueIds }, id);
    // Someone closes one of the two on the Issues page before the instructor decides.
    await updateIssueOpen({
      issue_id: issueIds[0],
      open: false,
      course_id: '1',
      authn_user_id: owner.id,
    });
    await withUser(owner, async () => {
      await createClient(owner).courseAgent.postReviewDecision.mutate({
        conversationId: conversation.id,
        reviewId: id,
        decision: 'approved',
      });
    });
    await waitForDeliveries(1);
    expect(delivered[0].body).toMatchObject({
      outcome: {
        status: 'failed',
        error: expect.stringContaining('no longer what the instructor approved'),
      },
    });
    // The card said two issues, so the one still open is left alone.
    expect(await issuesOpen(issueIds)).toEqual([false, true]);
  });
});
