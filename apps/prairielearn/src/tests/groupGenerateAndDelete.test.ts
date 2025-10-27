import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import * as groupUpdate from '../lib/group-update.js';
import { deleteAllGroups } from '../lib/groups.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import { selectAssessmentById } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const locals: Record<string, any> = {};

describe('test random groups and delete groups', { timeout: 20_000 }, function () {
  beforeAll(helperServer.before(TEST_COURSE_PATH));

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
    });
    await helperServer.waitForJobSequenceSuccess(job_sequence_id);
  });

  test.sequential('check groups and users', async () => {
    const groupUserCountsRowCount = await sqldb.execute(
      'SELECT count(group_id) FROM group_users GROUP BY group_id',
    );
    assert.equal(groupUserCountsRowCount, 50);

    const groupUsersRowCount = await sqldb.execute('SELECT DISTINCT(user_id) FROM group_users');
    assert.equal(groupUsersRowCount, 500);
  });

  test.sequential('delete groups', async () => {
    await deleteAllGroups(locals.assessment_id, '1');

    const groupsRowCount = await sqldb.execute(
      'SELECT deleted_at FROM groups WHERE deleted_at IS NULL',
    );
    assert.equal(groupsRowCount, 0);

    const groupUsersRowCount = await sqldb.execute('SELECT * FROM group_users');
    assert.equal(groupUsersRowCount, 0);
  });
});
