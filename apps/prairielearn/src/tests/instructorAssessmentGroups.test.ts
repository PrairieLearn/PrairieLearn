import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';

import { loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { getAssessmentTrpcUrl, getAssessmentUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { type User } from '../lib/db-types.js';
import {
  insertCourseInstancePermissions,
  insertCoursePermissionsByUserUid,
} from '../models/course-permissions.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';

import * as helperClient from './helperClient.js';
import * as helperServer from './helperServer.js';
import { getOrCreateUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

describe('Instructor group controls', () => {
  const siteUrl = 'http://localhost:' + config.serverPort;
  const courseInstanceId = '1';

  beforeAll(helperServer.before());

  beforeAll(async () => {
    const instructor = await getOrCreateUser({
      uid: 'instructor@example.com',
      name: 'Instructor User',
      uin: '100000000',
      email: 'instructor@example.com',
    });
    await insertCoursePermissionsByUserUid({
      course_id: '1',
      uid: instructor.uid,
      course_role: 'Owner',
      authn_user_id: instructor.id,
    });
    await insertCourseInstancePermissions({
      course_id: '1',
      user_id: instructor.id,
      course_instance_id: courseInstanceId,
      course_instance_role: 'Student Data Editor',
      authn_user_id: instructor.id,
    });
  });

  afterAll(helperServer.after);

  let users: User[] = [];
  let assessment_id: string;
  let individual_assessment_id: string;
  let trpcClient: ReturnType<typeof createAssessmentTrpcClient>;
  let group1RowId: string | undefined;
  let group2RowId: string | undefined;

  test.sequential('has group-based homework assessment', async () => {
    assessment_id = await queryScalar(sql.select_group_work_assessment, IdSchema);
    individual_assessment_id = await queryScalar(sql.select_individual_work_assessment, IdSchema);
    const csrfToken = generatePrefixCsrfToken(
      {
        url: getAssessmentTrpcUrl({ courseInstanceId, assessmentId: assessment_id }),
        authn_user_id: '1',
      },
      config.secretKey,
    );
    trpcClient = createAssessmentTrpcClient({
      csrfToken,
      courseInstanceId,
      assessmentId: assessment_id,
      urlBase: siteUrl,
    });
  });

  test.sequential('group work enable button reflects course edit permissions', async () => {
    const groupsUrl = `${siteUrl}${getAssessmentUrl({
      courseInstanceId,
      assessmentId: individual_assessment_id,
    })}/groups`;
    const previewerResponse = await helperClient.fetchCheerio(groupsUrl, {
      headers: {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_role=Previewer; pl2_requested_course_instance_role=None',
      },
    });
    assert.isTrue(previewerResponse.ok);
    const previewerBody = await previewerResponse.text();
    assert.include(previewerBody, 'Enabling group work requires course editor permissions.');
    assert.lengthOf(previewerResponse.$('button:contains("Enable group work")'), 0);

    const editorResponse = await helperClient.fetchCheerio(groupsUrl, {
      headers: {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_role=Editor; pl2_requested_course_instance_role=None',
      },
    });
    assert.isTrue(editorResponse.ok);
    assert.lengthOf(editorResponse.$('button:contains("Enable group work")'), 1);
  });

  test.sequential('enroll random users', async () => {
    users = await generateAndEnrollUsers({ count: 5, course_instance_id: courseInstanceId });
  });

  test.sequential('can create a new group', async () => {
    await trpcClient.assessmentGroups.addGroup.mutate({
      groupName: 'TestGroup',
      uids: users
        .slice(0, 2)
        .map((u) => u.uid)
        .join(','),
    });
    const membership = await trpcClient.assessmentGroups.membership.query();
    const group = membership.groups.find((group) => group.name === 'TestGroup');
    assert.isDefined(group);
    assert.equal(group.name, 'TestGroup');
    assert.deepEqual(group.users.map((u) => u.uid).sort(), [users[0].uid, users[1].uid].sort());
    group1RowId = group.group_id;
  });

  test.sequential(
    'course previewer can load groups page without receiving membership data',
    async () => {
      const groupsUrl = `${siteUrl}${getAssessmentUrl({
        courseInstanceId,
        assessmentId: assessment_id,
      })}/groups`;
      const response = await helperClient.fetchCheerio(groupsUrl, {
        headers: {
          cookie:
            'pl_test_user=test_instructor; pl2_requested_course_role=Previewer; pl2_requested_course_instance_role=None',
        },
      });
      assert.isTrue(response.ok);
      const body = await response.text();
      assert.include(
        body,
        'You must have student data viewer permissions to view student group memberships.',
      );
      assert.include(body, 'Editing group settings requires course editor permissions.');
      assert.notInclude(body, users[0].uid);
      assert.notInclude(body, users[1].uid);
    },
  );

  test.sequential(
    'course editor can edit group settings without seeing membership data',
    async () => {
      const groupsUrl = `${siteUrl}${getAssessmentUrl({
        courseInstanceId,
        assessmentId: assessment_id,
      })}/groups`;
      const response = await helperClient.fetchCheerio(groupsUrl, {
        headers: {
          cookie:
            'pl_test_user=test_instructor; pl2_requested_course_role=Editor; pl2_requested_course_instance_role=None',
        },
      });
      assert.isTrue(response.ok);
      const body = await response.text();
      assert.include(
        body,
        'You must have student data viewer permissions to view student group memberships.',
      );
      assert.include(
        body,
        'Disabling group work requires student data editor permissions because it permanently removes group memberships.',
      );
      assert.notInclude(body, users[0].uid);
      assert.notInclude(body, users[1].uid);
    },
  );

  test.sequential('student data viewer can see group memberships', async () => {
    const groupsUrl = `${siteUrl}${getAssessmentUrl({
      courseInstanceId,
      assessmentId: assessment_id,
    })}/groups`;
    const response = await helperClient.fetchCheerio(groupsUrl, {
      headers: {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_role=None; pl2_requested_course_instance_role=Student Data Viewer',
      },
    });
    assert.isTrue(response.ok);
    const body = await response.text();
    assert.include(body, 'Editing group settings requires course editor permissions.');
    assert.include(body, 'Editing group memberships requires student data editor permissions.');
    assert.lengthOf(response.$('button:contains("Add group")'), 0);
    assert.include(body, users[0].uid);
    assert.include(body, users[1].uid);
  });

  test.sequential('student data editor can edit memberships without editing settings', async () => {
    const groupsUrl = `${siteUrl}${getAssessmentUrl({
      courseInstanceId,
      assessmentId: assessment_id,
    })}/groups`;
    const response = await helperClient.fetchCheerio(groupsUrl, {
      headers: {
        cookie:
          'pl_test_user=test_instructor; pl2_requested_course_role=None; pl2_requested_course_instance_role=Student Data Editor',
      },
    });
    assert.isTrue(response.ok);
    const body = await response.text();
    assert.include(body, 'Editing group settings requires course editor permissions.');
    assert.include(
      body,
      'Disabling group work requires course editor permissions because it changes group settings.',
    );
    assert.lengthOf(response.$('button:contains("Add group"):not(:disabled)'), 1);
    assert.include(body, users[0].uid);
    assert.include(body, users[1].uid);
  });

  test.sequential('cannot create a group with a user already in another group', async () => {
    await expect(
      trpcClient.assessmentGroups.addGroup.mutate({
        groupName: 'TestGroup2',
        uids: users
          .slice(0, 2)
          .map((u) => u.uid)
          .join(','),
      }),
    ).rejects.toThrow(/in another group/);
  });

  test.sequential('can create a second group', async () => {
    await trpcClient.assessmentGroups.addGroup.mutate({
      groupName: 'TestGroup2',
      uids: users
        .slice(2, 4)
        .map((u) => u.uid)
        .join(','),
    });
    const membership = await trpcClient.assessmentGroups.membership.query();
    const group = membership.groups.find((group) => group.name === 'TestGroup2');
    assert.isDefined(group);
    assert.equal(group.name, 'TestGroup2');
    assert.deepEqual(group.users.map((u) => u.uid).sort(), [users[2].uid, users[3].uid].sort());
    group2RowId = group.group_id;
  });

  test.sequential('can create a group with an instructor', async () => {
    await trpcClient.assessmentGroups.addGroup.mutate({
      groupName: 'TestGroupWithInstructor',
      uids: 'dev@example.com',
    });
    const membership = await trpcClient.assessmentGroups.membership.query();
    const group = membership.groups.find((group) => group.name === 'TestGroupWithInstructor');
    assert.isDefined(group);
    assert.equal(group.name, 'TestGroupWithInstructor');
    assert.ok(group.users.some((u) => u.uid === 'dev@example.com'));
  });

  test.sequential('can add a user to an existing group', async () => {
    assert.isDefined(group1RowId);
    const { failures } = await trpcClient.assessmentGroups.editGroup.mutate({
      groupId: group1RowId,
      uids: [users[0].uid, users[1].uid, users[4].uid].join(','),
    });
    assert.lengthOf(failures, 0);
    const membership = await trpcClient.assessmentGroups.membership.query();
    const group = membership.groups.find((group) => group.group_id === group1RowId);
    assert.isDefined(group);
    assert.ok(group.users.some((u) => u.uid === users[4].uid));
  });

  test.sequential('cannot add a user to a group if they are already in another group', async () => {
    assert.isDefined(group2RowId);
    const { failures } = await trpcClient.assessmentGroups.editGroup.mutate({
      groupId: group2RowId,
      uids: [users[2].uid, users[3].uid, users[4].uid].join(','),
    });
    assert.lengthOf(failures, 1);
    assert.equal(failures[0].uid, users[4].uid);
    assert.match(failures[0].message, /in another group/);
    const membership = await trpcClient.assessmentGroups.membership.query();
    const group = membership.groups.find((group) => group.group_id === group2RowId);
    assert.isDefined(group);
    assert.notOk(group.users.some((u) => u.uid === users[4].uid));
  });

  test.sequential('can fetch current group membership', async () => {
    assert.isDefined(group1RowId);
    assert.isDefined(group2RowId);

    const membership = await trpcClient.assessmentGroups.membership.query();

    assert.includeMembers(
      membership.groups.map((group) => group.group_id),
      [group1RowId, group2RowId],
    );
    for (const user of users) {
      assert.notInclude(membership.notAssigned, user.uid);
    }
  });
});
