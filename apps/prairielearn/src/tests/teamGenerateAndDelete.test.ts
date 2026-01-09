import { afterAll, assert, beforeAll, describe, test } from 'vitest';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { dangerousFullSystemAuthz } from '../lib/authz-data-lib.js';
import { TEST_COURSE_PATH } from '../lib/paths.js';
import * as teamUpdate from '../lib/team-update.js';
import { deleteAllTeams } from '../lib/teams.js';
import { selectAssessmentById } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { generateAndEnrollUsers } from '../models/enrollment.js';

import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);
const locals: Record<string, any> = {};

describe('test random teams and delete teams', { timeout: 20_000 }, function () {
  beforeAll(helperServer.before(TEST_COURSE_PATH));

  afterAll(helperServer.after);

  test.sequential('get team-based homework assessment', async () => {
    const assessmentIds = await sqldb.queryRows(sql.select_team_work_assessment, IdSchema);
    assert.equal(assessmentIds.length, 2);
    locals.assessment_id = assessmentIds[0];
  });

  test.sequential('create 500 users', async () => {
    const result = await generateAndEnrollUsers({ count: 500, course_instance_id: '1' });
    assert.equal(result.length, 500);
  });

  test.sequential('randomly assign teams', async () => {
    const assessment = await selectAssessmentById(locals.assessment_id);
    const course_instance = await selectCourseInstanceById(assessment.course_instance_id);
    const job_sequence_id = await teamUpdate.randomTeams({
      course_instance,
      assessment,
      user_id: '1',
      authn_user_id: '1',
      max_team_size: 10,
      min_team_size: 10,
      authzData: dangerousFullSystemAuthz(),
    });
    await helperServer.waitForJobSequenceSuccess(job_sequence_id);
  });

  test.sequential('check teams and users', async () => {
    const teamUserCountsRowCount = await sqldb.execute(
      'SELECT count(team_id) FROM team_users GROUP BY team_id',
    );
    assert.equal(teamUserCountsRowCount, 50);

    const teamUsersRowCount = await sqldb.execute('SELECT DISTINCT(user_id) FROM team_users');
    assert.equal(teamUsersRowCount, 500);
  });

  test.sequential('delete teams', async () => {
    await deleteAllTeams(locals.assessment_id, '1');

    const teamsRowCount = await sqldb.execute(
      'SELECT deleted_at FROM teams WHERE deleted_at IS NULL',
    );
    assert.equal(teamsRowCount, 0);

    const teamUsersRowCount = await sqldb.execute('SELECT * FROM team_users');
    assert.equal(teamUsersRowCount, 0);
  });
});
