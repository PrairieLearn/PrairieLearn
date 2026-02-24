import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import * as groupUpdate from '../lib/group-update.js';
import { createGroup, deleteAllGroups, deleteGroup } from '../lib/groups.js';
import {
  insertGroupAssessmentInstance,
  selectAssessmentInstanceById,
} from '../models/assessment-instance.js';
import { selectAssessmentById } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const locals: Record<string, any> = {};

describe('test random groups and delete groups', { timeout: 20_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  test.sequential('get group-based homework assessment', async () => {
    const assessmentIds = await sqldb.queryRows(sql.select_group_work_assessment, IdSchema);
    assert.equal(assessmentIds.length, 2);
    locals.assessment_id = assessmentIds[0];
  });

  test.sequential('create 500 users', async () => {
    const result = await generateAndEnrollUsers({ count: 500, course_instance_id: '1' });
    assert.equal(result.length, 500);
  });

  test.sequential('randomly assign groups', async () => {
    const assessment = await selectAssessmentById(locals.assessment_id);
    const course_instance = await selectCourseInstanceById(assessment.course_instance_id);
    const job_sequence_id = await groupUpdate.randomGroups({
      course_instance,
      assessment,
      user_id: '1',
      authn_user_id: '1',
      max_group_size: 10,
      min_group_size: 10,
      authzData: dangerousFullSystemAuthz(),
    });
    await helperServer.waitForJobSequenceSuccess(job_sequence_id);
  });

  test.sequential('check groups and users', async () => {
    const groupUserCountsRowCount = await sqldb.execute(
      'SELECT count(team_id) FROM team_users GROUP BY team_id',
    );
    assert.equal(groupUserCountsRowCount, 50);

    const groupUsersRowCount = await sqldb.execute('SELECT DISTINCT(user_id) FROM team_users');
    assert.equal(groupUsersRowCount, 500);
  });

  test.sequential('delete groups', async () => {
    await deleteAllGroups(locals.assessment_id, '1');

    const groupsRowCount = await sqldb.execute(
      'SELECT deleted_at FROM teams WHERE deleted_at IS NULL',
    );
    assert.equal(groupsRowCount, 0);

    const groupUsersRowCount = await sqldb.execute('SELECT * FROM team_users');
    assert.equal(groupUsersRowCount, 0);
  });
});

describe('deleting a group closes its assessment instances', { timeout: 20_000 }, function () {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  let assessmentId: string;
  let courseInstance: Awaited<ReturnType<typeof selectCourseInstanceById>>;
  let assessment: Awaited<ReturnType<typeof selectAssessmentById>>;
  let userUids: string[];

  test.sequential('setup', async () => {
    const assessmentIds = await sqldb.queryRows(sql.select_group_work_assessment, IdSchema);
    assessmentId = assessmentIds[0];
    assessment = await selectAssessmentById(assessmentId);
    courseInstance = await selectCourseInstanceById(assessment.course_instance_id);
    const users = await generateAndEnrollUsers({ count: 3, course_instance_id: '1' });
    userUids = users.map((u) => u.uid);
  });

  test.sequential('deleting a single group closes its assessment instance', async () => {
    const group = await createGroup({
      course_instance: courseInstance,
      assessment,
      group_name: 'testgroup1',
      uids: [userUids[0]],
      authn_user_id: '1',
      authzData: dangerousFullSystemAuthz(),
    });

    // Create an open assessment instance for the group.
    const ai = await insertGroupAssessmentInstance({
      assessment_id: assessmentId,
      team_id: group.id,
      authn_user_id: '1',
    });
    assert.isTrue(ai.open);

    await deleteGroup(assessmentId, group.id, '1');

    const updated = await selectAssessmentInstanceById(ai.id);
    assert.isFalse(updated.open);
    assert.isNotNull(updated.closed_at);
  });

  test.sequential('deleting all groups closes their assessment instances', async () => {
    const group = await createGroup({
      course_instance: courseInstance,
      assessment,
      group_name: 'testgroup2',
      uids: [userUids[1]],
      authn_user_id: '1',
      authzData: dangerousFullSystemAuthz(),
    });

    const ai = await insertGroupAssessmentInstance({
      assessment_id: assessmentId,
      team_id: group.id,
      authn_user_id: '1',
    });
    assert.isTrue(ai.open);

    await deleteAllGroups(assessmentId, '1');

    const updated = await selectAssessmentInstanceById(ai.id);
    assert.isFalse(updated.open);
    assert.isNotNull(updated.closed_at);
  });
});
