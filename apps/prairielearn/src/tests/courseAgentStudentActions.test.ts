import { once } from 'node:events';
import { createServer } from 'node:http';

import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';

import { loadSqlEquiv, queryOptionalScalar, queryScalars } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { insertCourseAgentConversation } from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import {
  type CourseAgentConversation,
  EnumEnrollmentStatusSchema,
  type User,
} from '../lib/db-types.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  selectCourseInstancePermissionForUser,
  selectCoursePermissionForUser,
} from '../models/course-permissions.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import { selectOptionalUserByUid } from '../models/user.js';
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

  /** Actions on the course itself take no course instance. */
  const COURSE_ACTIONS = new Set(['staff_add', 'staff_set_course_role']);

  async function request(action: string, input: Record<string, unknown>) {
    const id = crypto.randomUUID();
    const response = await fetch(`${siteUrl}/pl/course/1/course_agent/actions/${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_TOKEN}`,
        'X-Course-Agent-Conversation': conversation.agent_conversation_id,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id,
        input: COURSE_ACTIONS.has(action) ? input : { ...WHERE, ...input },
      }),
    });
    return { id, status: response.status, body: (await response.json()) as Record<string, any> };
  }

  async function approve(action: string, input: Record<string, unknown>) {
    const requested = await request(action, input);
    assert.equal(requested.status, 200, JSON.stringify(requested.body));
    await withUser(owner, async () => {
      await createCourseTrpcClient({
        courseId: '1',
        urlBase: siteUrl,
        csrfToken: generatePrefixCsrfToken(
          { url: '/pl/course/1/trpc', authn_user_id: owner.id },
          config.secretKey,
        ),
      }).courseAgent.postReviewDecision.mutate({
        conversationId: conversation.id,
        reviewId: requested.id,
        decision: 'approved',
      });
    });
    return { card: requested.body.card, result: delivered.get(requested.id)! };
  }

  async function refusal(action: string, input: Record<string, unknown>) {
    const refused = await request(action, input);
    assert.equal(refused.status, 400, JSON.stringify(refused.body));
    return z.string().parse(refused.body.message);
  }

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
    expect(await refusal('students_invite', { uids: [newcomer] })).toContain('already invited');

    const cancelled = await approve('students_cancel_invitation', { uids: [newcomer] });
    expect(cancelled.card.rows).toEqual([{ label: newcomer, detail: 'Now: invited' }]);
    expect(await status(newcomer)).toBeNull();
    expect(await refusal('students_invite', { uids: ['not an email'] })).toContain('uids');
  });

  test('blocks, removes, and re-enrolls students, refusing changes that do not apply', async () => {
    const [a, b] = students;
    expect(await refusal('students_reenroll', { uids: [a.uid] })).toContain(`${a.uid} is joined`);
    expect(await refusal('students_block', { uids: ['nobody@example.com'] })).toContain(
      'no student with UID nobody@example.com',
    );

    const blocked = await approve('students_block', { uids: [a.uid] });
    expect(blocked.card).toMatchObject({
      title: 'Block 1 student',
      rows: [{ label: a.uid, detail: 'Now: joined' }],
    });
    expect(await status(a.uid)).toBe('blocked');
    await approve('students_remove', { uids: [b.uid] });
    expect(await status(b.uid)).toBe('removed');

    // A student already in the requested state is left as is and named in the card.
    const reenrolled = await approve('students_reenroll', {
      uids: [a.uid, b.uid, students[2].uid],
    });
    expect(reenrolled.card).toMatchObject({
      title: 'Re-enroll 2 students',
      context: 'Sp15 · 1 other student left as is',
    });
    expect([await status(a.uid), await status(b.uid)]).toEqual(['joined', 'joined']);
  });

  test('adds students to a label and takes them out', async () => {
    const uids = students.slice(0, 2).map(({ uid }) => uid);
    const inLabel = () => queryScalars(sql.select_label_uids, { name: 'Extra time' }, z.string());
    expect(await refusal('student_labels_add_students', { label_name: 'Missing', uids })).toContain(
      'Its labels: ',
    );
    const added = await approve('student_labels_add_students', { label_name: 'Extra time', uids });
    expect(added.card.title).toBe('Add the label "Extra time" to 2 students');
    expect(await inLabel()).toEqual([...uids].sort());
    await approve('student_labels_remove_students', { label_name: 'Extra time', uids: [uids[0]] });
    expect(await inLabel()).toEqual([uids[1]]);
  });

  test('adds staff, changes their role, and grants student data access, never to oneself', async () => {
    const roleOf = async (uid: string) => {
      const user = await selectOptionalUserByUid(uid);
      return user
        ? await selectCoursePermissionForUser({ course_id: '1', user_id: user.id })
        : null;
    };
    const ta = 'ta@example.com';
    const lead = await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'lead@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    expect(await refusal('staff_add', { uids: [owner.uid], course_role: 'Viewer' })).toContain(
      'cannot change their own access',
    );
    const added = await approve('staff_add', { uids: [ta, lead.uid], course_role: 'Viewer' });
    expect(added.card).toMatchObject({
      title: 'Give 1 person Viewer access to the course',
      context: '1 other already Viewer or more',
      rows: [{ label: ta, detail: 'New to the staff' }],
    });
    expect(await roleOf(ta)).toBe('Viewer');
    expect(await refusal('staff_add', { uids: [ta], course_role: 'Previewer' })).toContain(
      'already have Previewer access or more',
    );

    const raised = await approve('staff_set_course_role', { uid: ta, course_role: 'Editor' });
    expect(raised.card.rows).toEqual([{ label: ta, detail: 'Now: Viewer' }]);
    expect(await roleOf(ta)).toBe('Editor');
    expect(
      await refusal('staff_set_course_role', { uid: owner.uid, course_role: 'Viewer' }),
    ).toContain('cannot change their own access');
    expect(
      await refusal('staff_set_course_role', {
        uid: 'stranger@example.com',
        course_role: 'Viewer',
      }),
    ).toContain("not on this course's staff");

    const instanceRole = async () =>
      await selectCourseInstancePermissionForUser({
        course_instance_id: '1',
        user_id: (await selectOptionalUserByUid(ta))!.id,
      });
    const granted = await approve('staff_set_student_data_access', { uid: ta, access: 'editor' });
    expect(granted.card).toMatchObject({
      title: `Set the student data access of ${ta} to Student Data Editor`,
      context: 'Sp15',
      rows: [{ label: ta, detail: 'Now: None' }],
    });
    expect(await instanceRole()).toBe('Student Data Editor');
    await approve('staff_set_student_data_access', { uid: ta, access: 'none' });
    expect(await instanceRole()).toBeNull();
  });

  test('creates and removes a publishing extension', async () => {
    const uids = [students[0].uid];
    const withExtension = () =>
      queryScalars(sql.select_extension_uids, { name: 'Makeup week' }, z.string());
    // The test course instance is open to everyone until 2400.
    expect(
      await refusal('publishing_extensions_create', {
        name: 'Makeup week',
        end_date: '2300-01-01T00:00:00Z',
        uids,
      }),
    ).toContain('must end later than that');
    expect(
      await refusal('publishing_extensions_create', {
        name: 'Makeup week',
        end_date: '2000-01-01T00:00:00Z',
        uids,
      }),
    ).toContain('already passed');

    const input = { name: 'Makeup week', end_date: '2401-01-01T00:00:00Z', uids };
    const created = await approve('publishing_extensions_create', input);
    expect(created.card).toMatchObject({
      title: expect.stringMatching(/^Extend access for 1 student until 2400-12-31 /),
      context: 'Sp15 · Extension "Makeup week"',
      rows: [{ label: students[0].uid, detail: null }],
    });
    expect(await withExtension()).toEqual(uids);
    expect(await refusal('publishing_extensions_create', input)).toContain(
      'already has an extension',
    );

    await approve('publishing_extensions_delete', { name: 'Makeup week' });
    expect(await withExtension()).toEqual([]);
    expect(await refusal('publishing_extensions_delete', { name: 'Makeup week' })).toContain(
      'no extension named "Makeup week"',
    );
  });
});
