import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterAll, assert, beforeAll, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import { loadSqlEquiv, queryOptionalScalar } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { insertCourseAgentConversation } from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import {
  type CourseAgentConversation,
  EnumEnrollmentStatusSchema,
  type User,
} from '../lib/db-types.js';
import {
  deleteCourseInstancePermissions,
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import { createCourseTrpcClient } from '../trpc/course/client.js';

import * as helperServer from './helperServer.js';
import { withUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

const siteUrl = `http://localhost:${config.serverPort}`;
const SERVICE_TOKEN = 'course-agent-service-token-for-tests-0123456789';
const WHERE = { course_instance_short_name: 'Sp15' };

const status = (uid: string) =>
  queryOptionalScalar(sql.select_status, { uid }, EnumEnrollmentStatusSchema);

describe('Course agent student actions', { timeout: 60_000, concurrent: false }, () => {
  const delivered = new Map<string, Record<string, any>>();
  const service = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const id = /\/reviews\/([^/]+)\/outcome$/.exec(request.url!)?.[1];
    if (id) delivered.set(id, JSON.parse(Buffer.concat(chunks).toString()));
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ outcomeRecorded: true }));
  });
  let owner: User;
  let students: User[];
  let conversation: CourseAgentConversation;
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
    owner = await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'owner@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    await insertCourseInstancePermissions({
      course_id: '1',
      course_instance_id: '1',
      user_id: owner.id,
      course_instance_role: 'Student Data Editor',
      authn_user_id: '1',
    });
    conversation = await insertCourseAgentConversation({
      course_id: '1',
      user_id: owner.id,
      agent_conversation_id: crypto.randomUUID(),
      title: 'Test conversation',
    });
    students = await generateAndEnrollUsers({ count: 3, course_instance_id: '1' });
  });
  afterAll(helperServer.after);
  afterAll(async () => {
    service.close();
    await once(service, 'close');
  });
  afterAll(() => Object.assign(config, originalConfig));

  /** Who makes the requests and decisions; the owner with student data access unless a test says otherwise. */
  interface Actor {
    user: User;
    conversation: CourseAgentConversation;
  }

  const client = ({ user }: Actor) =>
    createCourseTrpcClient({
      courseId: '1',
      urlBase: siteUrl,
      csrfToken: generatePrefixCsrfToken(
        { url: '/pl/course/1/trpc', authn_user_id: user.id },
        config.secretKey,
      ),
    });

  async function request(
    action: string,
    input: Record<string, unknown>,
    actor: Actor = { user: owner, conversation },
  ) {
    const id = crypto.randomUUID();
    const response = await fetch(`${siteUrl}/pl/course/1/course_agent/actions/${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_TOKEN}`,
        'X-Course-Agent-Conversation': actor.conversation.agent_conversation_id,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, input: { ...WHERE, ...input } }),
    });
    return { id, status: response.status, body: (await response.json()) as Record<string, any> };
  }

  /** Requests an action, approves it as the instructor, and returns their card and the agent's result. */
  async function approve(
    action: string,
    input: Record<string, unknown>,
    actor: Actor = { user: owner, conversation },
    beforeDeciding: () => Promise<void> = async () => {},
  ) {
    const requested = await request(action, input, actor);
    assert.equal(requested.status, 200, JSON.stringify(requested.body));
    await beforeDeciding();
    const card = await withUser(actor.user, async () => {
      const ids = { conversationId: actor.conversation.id, actionId: requested.id };
      const shown = await client(actor).courseAgent.getAction.query(ids);
      await client(actor).courseAgent.postReviewDecision.mutate({
        conversationId: actor.conversation.id,
        reviewId: requested.id,
        decision: 'approved',
      });
      return shown.card;
    });
    // The result is sent to the service after the approval request answers.
    await vi.waitFor(() => expect(delivered.has(requested.id)).toBe(true));
    return { card, result: delivered.get(requested.id)! };
  }

  async function refusal(action: string, input: Record<string, unknown>, actor?: Actor) {
    const refused = await request(action, input, actor);
    assert.equal(refused.status, 400, JSON.stringify(refused.body));
    return z.string().parse(refused.body.message);
  }

  test('needs student data access in the course instance, which being an owner does not give', async () => {
    const user = await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'other-owner@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    const actor = {
      user,
      conversation: await insertCourseAgentConversation({
        course_id: '1',
        user_id: user.id,
        agent_conversation_id: crypto.randomUUID(),
        title: 'Test conversation',
      }),
    };
    const input = { uids: [students[2].uid] };
    expect(await refusal('students_block', input, actor)).toContain(
      'Student Data Editor access to the course instance',
    );

    // Access is checked again at approval, so losing it after the request stops the action.
    const role = { course_id: '1', course_instance_id: '1', user_id: user.id, authn_user_id: '1' };
    await insertCourseInstancePermissions({ ...role, course_instance_role: 'Student Data Editor' });
    const { result } = await approve('students_block', input, actor, () =>
      deleteCourseInstancePermissions(role),
    );
    expect(result.outcome).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('Student Data Editor access to the course instance'),
    });
    expect(await status(students[2].uid)).toBe('joined');
  });

  test('invites only people who can be invited, and cancels an invitation', async () => {
    const newcomer = 'newcomer@example.com';
    const invited = await approve('students_invite', {
      uids: [newcomer, students[0].uid, owner.uid],
    });
    expect(invited.card).toMatchObject({
      title: 'Invite 1 student',
      context: 'Sp15 · 2 others skipped',
      rows: [{ label: newcomer, detail: 'New' }],
    });
    expect(invited.result.outcome).toEqual({ status: 'succeeded', summary: 'Invited 1 student.' });
    expect(await status(newcomer)).toBe('invited');
    // A refusal says what was wrong with the request, not what state each person is in.
    const refused = await refusal('students_invite', { uids: [newcomer] });
    expect(refused).toContain('None of these can be invited');
    expect(refused).not.toContain(newcomer);

    const cancelled = await approve('students_cancel_invitation', { uids: [newcomer] });
    expect(cancelled.card.rows).toEqual([{ label: newcomer, detail: 'Now: invited' }]);
    expect(await status(newcomer)).toBeNull();
    expect(await refusal('students_invite', { uids: ['not an email'] })).toContain('uids');
  });

  test('blocks, removes, and re-enrolls students, refusing changes that do not apply', async () => {
    const [a, b] = students;
    expect(await refusal('students_reenroll', { uids: [a.uid] })).toContain(
      'none of these students has it',
    );
    expect(await refusal('students_block', { uids: [a.uid, 'nobody@example.com'] })).toContain(
      '1 of these 2 UIDs is not in the course instance "Sp15"',
    );

    const blocked = await approve('students_block', { uids: [a.uid] });
    expect(blocked.card).toMatchObject({
      title: 'Block 1 student',
      rows: [{ label: a.uid, detail: 'Now: joined' }],
    });
    expect(await status(a.uid)).toBe('blocked');
    await approve('students_remove', { uids: [b.uid] });
    expect(await status(b.uid)).toBe('removed');

    // A student already in the requested state is left as is, and the card counts them.
    const reenrolled = await approve('students_reenroll', {
      uids: [a.uid, b.uid, students[2].uid],
    });
    expect(reenrolled.card).toMatchObject({
      title: 'Re-enroll 2 students',
      context: 'Sp15 · 1 other student left as is',
    });
    expect([await status(a.uid), await status(b.uid)]).toEqual(['joined', 'joined']);
  });
});
