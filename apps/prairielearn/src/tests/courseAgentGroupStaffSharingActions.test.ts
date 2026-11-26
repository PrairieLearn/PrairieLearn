import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';

import { loadSqlEquiv, queryScalar, queryScalars } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { insertCourseAgentConversation } from '../ee/models/course-agent-conversation.js';
import { config } from '../lib/config.js';
import type { CourseAgentConversation, User } from '../lib/db-types.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
  selectCourseInstancePermissionForUser,
  selectCoursePermissionForUser,
} from '../models/course-permissions.js';
import { insertCourse, selectCourseById } from '../models/course.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import { selectSharingSetsForCourse } from '../models/sharing-set.js';
import { selectOptionalUserByUid } from '../models/user.js';

import * as helperServer from './helperServer.js';

const sql = loadSqlEquiv(import.meta.url);

const actionsUrl = `http://localhost:${config.serverPort}/pl/course/1/course_agent/actions`;
const SERVICE_TOKEN = 'course-agent-service-token-for-tests-0123456789';

describe('Course agent group, staff, and sharing actions', { timeout: 60_000 }, () => {
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
    // Enterprise routes must be mounted before starting the test server.
    Object.assign(config, {
      isEnterprise: true,
      courseAgentServiceUrl: 'http://course-agent.test',
      courseAgentServiceToken: [SERVICE_TOKEN],
      features: { ...config.features, 'course-agent': true, 'question-sharing': true },
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
  afterAll(() => Object.assign(config, originalConfig));

  async function run(name: string, input: unknown) {
    const response = await fetch(`${actionsUrl}/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_TOKEN}`,
        'X-Course-Agent-Conversation': conversation.agent_conversation_id,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: crypto.randomUUID(), input }),
    });
    return { status: response.status, body: await response.json() };
  }

  test('creates a group and changes who is in it', async () => {
    const [first, second, third] = students.map(({ uid }) => uid);
    const groupWork = {
      course_instance_short_name: 'Sp15',
      assessment_tid: 'hw5-templateGroupWork',
    };
    const members = (name: string) =>
      queryScalars(sql.select_group_uids, { tid: groupWork.assessment_tid, name }, z.string());

    const notGroupWork = await run('groups_create', {
      ...groupWork,
      assessment_tid: 'hw1-automaticTestSuite',
      uids: [first],
    });
    expect(notGroupWork.status).toBe(400);
    expect(notGroupWork.body.message).toContain('does not use group work');

    expect(
      await run('groups_create', { ...groupWork, group_name: 'owls', uids: [first, second] }),
    ).toEqual({ status: 200, body: { summary: 'Created the group "owls" with 2 students.' } });
    expect(await members('owls')).toEqual([first, second].sort());

    // One UID that is not in the course instance refuses the whole request.
    const stranger = await run('groups_add_members', {
      ...groupWork,
      group_name: 'owls',
      uids: [third, 'stranger@example.com'],
    });
    expect(stranger.status).toBe(400);
    expect(stranger.body.message).toContain('stranger@example.com is not enrolled');
    expect(await members('owls')).toEqual([first, second].sort());

    expect(
      await run('groups_add_members', { ...groupWork, group_name: 'owls', uids: [third] }),
    ).toEqual({ status: 200, body: { summary: 'Added 1 student to the group "owls".' } });
    const teamId = await queryScalar(
      sql.select_group_id,
      { tid: groupWork.assessment_tid, name: 'owls' },
      IdSchema,
    );
    expect(
      await run('groups_remove_members', { ...groupWork, team_id: teamId, uids: [first] }),
    ).toEqual({
      status: 200,
      body: { summary: 'Removed 1 student from the group "owls", which now has 2 members.' },
    });
    expect(await members('owls')).toEqual([second, third].sort());
  });

  test('adds staff, changes their access, and removes them', async () => {
    const ta = 'ta@example.com';
    const courseRole = async () =>
      selectCoursePermissionForUser({
        course_id: '1',
        user_id: (await selectOptionalUserByUid(ta))!.id,
      });
    const instanceRole = async () =>
      selectCourseInstancePermissionForUser({
        course_instance_id: '1',
        user_id: (await selectOptionalUserByUid(ta))!.id,
      });

    const added = await run('staff_add', {
      uids: [ta],
      course_role: 'Previewer',
      student_data_access: [{ course_instance_short_name: 'Sp15', role: 'Student Data Viewer' }],
    });
    expect(added).toEqual({
      status: 200,
      body: {
        summary:
          'Added 1 person to the course staff with course role Previewer, Student Data Viewer in Sp15, keeping any higher access they already had. 1 person has not signed in to PrairieLearn yet.',
      },
    });
    expect(await courseRole()).toBe('Previewer');
    expect(await instanceRole()).toBe('Student Data Viewer');

    const self = await run('staff_set_course_role', {
      uids: [ta, owner.uid],
      course_role: 'Viewer',
    });
    expect(self.status).toBe(400);
    expect(self.body.message).toContain('cannot change their own course access');
    expect(await courseRole()).toBe('Previewer');

    expect(await run('staff_set_course_role', { uids: [ta], course_role: 'Editor' })).toEqual({
      status: 200,
      body: { summary: 'Set the course role of 1 person to Editor.' },
    });
    expect(await courseRole()).toBe('Editor');

    const taId = (await selectOptionalUserByUid(ta))!.id;
    expect(
      await run('staff_set_instance_role', {
        course_instance_short_name: 'Sp15',
        user_ids: [taId],
        role: 'Student Data Editor',
      }),
    ).toEqual({
      status: 200,
      body: { summary: 'Gave 1 person Student Data Editor access in Sp15.' },
    });
    expect(await instanceRole()).toBe('Student Data Editor');
    await run('staff_set_instance_role', {
      course_instance_short_name: 'Sp15',
      uids: [ta],
      role: 'None',
    });
    expect(await instanceRole()).toBeNull();

    const unknown = await run('staff_remove', { uids: [ta, 'nobody@example.com'] });
    expect(unknown).toEqual({
      status: 400,
      body: {
        message:
          "Not on this course's staff: nobody@example.com. Nothing was changed. Find staff in the staff dataset, or add people with staff_add.",
      },
    });
    expect(await courseRole()).toBe('Editor');

    expect(await run('staff_remove', { uids: [ta] })).toEqual({
      status: 200,
      body: { summary: 'Removed 1 person from the course staff.' },
    });
    expect(await courseRole()).toBeNull();
  });

  test('gives another course access to a sharing set by its sharing token', async () => {
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
    const sharedWith = async () =>
      (await selectSharingSetsForCourse({ course_id: '1' })).find(
        ({ name }) => name === 'intro-set',
      )?.shared_with;
    const input = { sharing_set_name: 'intro-set', course_sharing_token: consumer.sharing_token };

    const own = await run('sharing_sets_add_course', {
      ...input,
      course_sharing_token: (await selectCourseById('1')).sharing_token,
    });
    expect(own.status).toBe(400);
    expect(own.body.message).toContain("this course's own sharing token");

    const unknown = await run('sharing_sets_add_course', {
      ...input,
      course_sharing_token: crypto.randomUUID(),
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body.message).toContain('No course has that sharing token');
    expect(await sharedWith()).toEqual([]);

    expect(await run('sharing_sets_add_course', input)).toEqual({
      status: 200,
      body: { summary: 'SHARE 101 can now use the questions in the sharing set "intro-set".' },
    });
    expect(await sharedWith()).toEqual(['SHARE 101']);
  });
});
