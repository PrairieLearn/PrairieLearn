import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';

import {
  loadSqlEquiv,
  queryOptionalRow,
  queryOptionalScalar,
  queryScalars,
} from '@prairielearn/postgres';

import { insertCourseAgentConversation } from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import {
  type CourseAgentConversation,
  CourseInstancePublishingExtensionSchema,
  EnumEnrollmentStatusSchema,
  type User,
} from '../lib/db-types.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';

import * as helperServer from './helperServer.js';

const sql = loadSqlEquiv(import.meta.url);

const siteUrl = `http://localhost:${config.serverPort}`;
const SERVICE_TOKEN = 'course-agent-service-token-for-tests-0123456789';

const status = (uid: string) =>
  queryOptionalScalar(sql.select_status, { uid }, EnumEnrollmentStatusSchema);
const labelUids = (name: string) => queryScalars(sql.select_label_uids, { name }, z.string());
const selectExtension = (name: string) =>
  queryOptionalRow(sql.select_extension, { name }, CourseInstancePublishingExtensionSchema);
const extensionUids = (extension_id: string) =>
  queryScalars(sql.select_extension_uids, { extension_id }, z.string());

describe('Course agent student actions', { timeout: 60_000 }, () => {
  let owner: User;
  let students: User[];
  let conversation: CourseAgentConversation;
  let limitedConversation: CourseAgentConversation;
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
    // A course owner with no access to student data in the course instance.
    const limited = await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: 'limited@example.com',
      course_role: 'Owner',
      authn_user_id: '1',
    });
    limitedConversation = await insertCourseAgentConversation({
      course_id: '1',
      user_id: limited.id,
      agent_conversation_id: crypto.randomUUID(),
      title: 'Test conversation',
    });
    students = await generateAndEnrollUsers({ count: 3, course_instance_id: '1' });
  });
  afterAll(helperServer.after);
  afterAll(() => Object.assign(config, originalConfig));

  async function run(name: string, input: Record<string, unknown>, as = conversation) {
    const response = await fetch(`${siteUrl}/pl/course/1/course_agent/actions/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_TOKEN}`,
        'X-Course-Agent-Conversation': as.agent_conversation_id,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        input: { course_instance_short_name: 'Sp15', ...input },
      }),
    });
    return { status: response.status, body: await response.json() };
  }

  async function summary(name: string, input: Record<string, unknown>) {
    const { status, body } = await run(name, input);
    assert.equal(status, 200, JSON.stringify(body));
    return z.string().parse(body.summary);
  }

  async function refusal(name: string, input: Record<string, unknown>, as = conversation) {
    const { status, body } = await run(name, input, as);
    assert.equal(status, 400, JSON.stringify(body));
    return z.string().parse(body.message);
  }

  test('invites only people who can be invited, and cancels an invitation', async () => {
    const newcomer = 'newcomer@example.com';
    expect(await summary('students_invite', { uids: [newcomer, students[0].uid, owner.uid] })).toBe(
      'Invited 1 student, and skipped 1 course staff member, 1 already joined.',
    );
    expect(await status(newcomer)).toBe('invited');

    expect(
      await refusal('students_cancel_invitation', { uids: [newcomer, students[0].uid] }),
    ).toContain(`${students[0].uid} is joined`);
    expect(await status(newcomer)).toBe('invited');

    expect(await summary('students_cancel_invitation', { uids: [newcomer] })).toBe(
      'Cancelled the invitation of 1 student.',
    );
    expect(await status(newcomer)).toBeNull();
  });

  test('blocks and re-enrolls students, refusing unknown UIDs and other users', async () => {
    const [a, b] = students;
    expect(await refusal('students_block', { uids: [a.uid, 'nobody@example.com'] })).toBe(
      'The course instance "Sp15" has no student with UID nobody@example.com. Check these UIDs with the instructor.',
    );
    expect(await refusal('students_block', { uids: [a.uid] }, limitedConversation)).toContain(
      'Student Data Editor access in the course instance',
    );
    expect(await status(a.uid)).toBe('joined');

    expect(await summary('students_block', { uids: [a.uid] })).toBe('Blocked 1 student.');
    expect(await status(a.uid)).toBe('blocked');
    expect(await summary('students_reenroll', { uids: [a.uid, b.uid] })).toBe(
      'Re-enrolled 1 student (1 other student already joined).',
    );
    expect(await status(a.uid)).toBe('joined');
  });

  test('adds students to a label and removes them', async () => {
    const uids = students.slice(0, 2).map(({ uid }) => uid);
    expect(await refusal('student_labels_add_students', { label_name: 'Missing', uids })).toBe(
      'The course instance "Sp15" has no student label named "Missing". Its labels are: "Extra time", "Section A".',
    );
    expect(
      await refusal('student_labels_add_students', {
        label_name: 'Extra time',
        uids: [...uids, 'nobody@example.com'],
      }),
    ).toContain('no student with UID nobody@example.com');
    expect(await labelUids('Extra time')).toEqual([]);

    expect(await summary('student_labels_add_students', { label_name: 'Extra time', uids })).toBe(
      'Added 2 students to the label "Extra time".',
    );
    expect(await labelUids('Extra time')).toEqual([...uids].sort());
    expect(
      await summary('student_labels_remove_students', {
        label_name: 'Extra time',
        uids: [uids[0], students[2].uid],
      }),
    ).toBe('Removed 1 student from the label "Extra time" (1 other student did not have it).');
    expect(await labelUids('Extra time')).toEqual([uids[1]]);
  });

  test('adds, edits, and removes a publishing extension', async () => {
    const [a, b, c] = students.map(({ uid }) => uid);
    // The test course instance is open to everyone until 2400-05-13.
    expect(
      await refusal('extensions_add', { name: 'Makeup', end_date: '2300-01-01T00:00', uids: [a] }),
    ).toContain('must end later than that');
    expect(
      await refusal('extensions_add', {
        name: 'Makeup',
        end_date: '2400-06-01T23:59:00',
        uids: [a, 'nobody@example.com'],
      }),
    ).toContain('no student with UID nobody@example.com');
    expect(await selectExtension('Makeup')).toBeNull();

    expect(
      await summary('extensions_add', {
        name: 'Makeup',
        end_date: '2400-06-01T23:59:00',
        uids: [a],
      }),
    ).toMatch(/^Added the extension "Makeup", giving 1 student access until .*2400/);
    const extension = await selectExtension('Makeup');
    assert.isNotNull(extension);
    expect(await extensionUids(extension.id)).toEqual([a]);

    expect(
      await summary('extensions_edit', {
        extension_id: extension.id,
        name: 'Makeup week',
        end_date: '2400-06-08T23:59:00',
        uids: [b, c],
      }),
    ).toMatch(/^Updated the extension "Makeup week", which now gives 2 students access until /);
    const edited = await selectExtension('Makeup week');
    assert.isNotNull(edited);
    expect(edited.end_date.getTime() - extension.end_date.getTime()).toBe(7 * 24 * 3600 * 1000);
    expect(await extensionUids(extension.id)).toEqual([b, c].sort());

    expect(await summary('extensions_remove', { extension_id: extension.id })).toBe(
      'Removed the extension "Makeup week", which covered 2 students.',
    );
    expect(await refusal('extensions_remove', { extension_id: extension.id })).toContain(
      `no extension with ID ${extension.id}`,
    );
  });
});
