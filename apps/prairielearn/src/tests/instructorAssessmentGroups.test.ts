import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';

import { loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';
import { IdSchema } from '@prairielearn/zod';

import { getAssessmentTrpcUrl } from '../lib/client/url.js';
import { config } from '../lib/config.js';
import { type User } from '../lib/db-types.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';
import { createAssessmentTrpcClient } from '../trpc/assessment/client.js';

import * as helperServer from './helperServer.js';

const sql = loadSqlEquiv(import.meta.url);

describe('Instructor group controls', () => {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  const siteUrl = 'http://localhost:' + config.serverPort;
  const courseInstanceId = '1';

  let users: User[] = [];
  let assessment_id: string;
  let trpcClient: ReturnType<typeof createAssessmentTrpcClient>;
  let group1RowId: string | undefined;
  let group2RowId: string | undefined;

  test.sequential('has group-based homework assessment', async () => {
    assessment_id = await queryScalar(sql.select_group_work_assessment, IdSchema);
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

  test.sequential('enroll random users', async () => {
    users = await generateAndEnrollUsers({ count: 5, course_instance_id: courseInstanceId });
  });

  test.sequential('can create a new group', async () => {
    const { group } = await trpcClient.assessmentGroups.addGroup.mutate({
      group_name: 'TestGroup',
      uids: users
        .slice(0, 2)
        .map((u) => u.uid)
        .join(','),
    });
    assert.equal(group.name, 'TestGroup');
    assert.deepEqual(group.users.map((u) => u.uid).sort(), [users[0].uid, users[1].uid].sort());
    group1RowId = group.group_id;
  });

  test.sequential('cannot create a group with a user already in another group', async () => {
    await expect(
      trpcClient.assessmentGroups.addGroup.mutate({
        group_name: 'TestGroup2',
        uids: users
          .slice(0, 2)
          .map((u) => u.uid)
          .join(','),
      }),
    ).rejects.toThrow(/in another group/);
  });

  test.sequential('can create a second group', async () => {
    const { group } = await trpcClient.assessmentGroups.addGroup.mutate({
      group_name: 'TestGroup2',
      uids: users
        .slice(2, 4)
        .map((u) => u.uid)
        .join(','),
    });
    assert.equal(group.name, 'TestGroup2');
    assert.deepEqual(group.users.map((u) => u.uid).sort(), [users[2].uid, users[3].uid].sort());
    group2RowId = group.group_id;
  });

  test.sequential('can create a group with an instructor', async () => {
    const { group } = await trpcClient.assessmentGroups.addGroup.mutate({
      group_name: 'TestGroupWithInstructor',
      uids: 'dev@example.com',
    });
    assert.equal(group.name, 'TestGroupWithInstructor');
    assert.ok(group.users.some((u) => u.uid === 'dev@example.com'));
  });

  test.sequential('can add a user to an existing group', async () => {
    assert.isDefined(group1RowId);
    const { group, failures } = await trpcClient.assessmentGroups.editGroup.mutate({
      group_id: group1RowId,
      uids: [users[0].uid, users[1].uid, users[4].uid].join(','),
    });
    assert.lengthOf(failures, 0);
    assert.ok(group.users.some((u) => u.uid === users[4].uid));
  });

  test.sequential('cannot add a user to a group if they are already in another group', async () => {
    assert.isDefined(group2RowId);
    const { group, failures } = await trpcClient.assessmentGroups.editGroup.mutate({
      group_id: group2RowId,
      uids: [users[2].uid, users[3].uid, users[4].uid].join(','),
    });
    assert.lengthOf(failures, 1);
    assert.equal(failures[0].uid, users[4].uid);
    assert.match(failures[0].message, /in another group/);
    assert.notOk(group.users.some((u) => u.uid === users[4].uid));
  });
});
