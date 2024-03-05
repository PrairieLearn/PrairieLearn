import { assert } from 'chai';
import * as sqldb from '@prairielearn/postgres';
import { step } from 'mocha-steps';

import * as helperServer from './helperServer';
import { deleteAllGroups } from '../lib/groups';
import * as groupUpdate from '../lib/group-update';
import { TEST_COURSE_PATH } from '../lib/paths';

const sql = sqldb.loadSqlEquiv(__filename);
const locals: Record<string, any> = {};

describe('test auto group and delete groups', function () {
  this.timeout(20000);
  before('set up testing server', helperServer.before(TEST_COURSE_PATH));
  after('shut down testing server', helperServer.after);

  step('get group-based homework assessment', async () => {
    const result = await sqldb.queryAsync(sql.select_group_work_assessment, []);
    assert.notEqual(result.rows.length, 0);
    assert.notEqual(result.rows[0].id, undefined);
    locals.assessment_id = result.rows[0].id;
  });

  step('create 500 users', async () => {
    const result = await sqldb.queryAsync(sql.generate_500, []);
    assert.equal(result.rows.length, 500);
  });

  step('auto assign groups', async () => {
    const user_id = '1';
    const authn_user_id = '1';
    const max_group_size = 10;
    const min_group_size = 10;
    const job_sequence_id = await groupUpdate.autoGroups(
      locals.assessment_id,
      user_id,
      authn_user_id,
      max_group_size,
      min_group_size,
    );
    await helperServer.waitForJobSequenceSuccessAsync(job_sequence_id);
  });

  step('check groups and users', async () => {
    const groupUserCounts = await sqldb.queryAsync(
      'SELECT count(group_id) FROM group_users GROUP BY group_id',
      [],
    );
    assert.equal(groupUserCounts.rows.length, 50);

    const groupUsers = await sqldb.queryAsync('SELECT DISTINCT(user_id) FROM group_users', []);
    assert.equal(groupUsers.rows.length, 500);
  });

  step('delete groups', async () => {
    await deleteAllGroups(locals.assessment_id, '1');

    const groups = await sqldb.queryAsync(
      'SELECT deleted_at FROM groups WHERE deleted_at IS NULL',
      [],
    );
    assert.equal(groups.rows.length, 0);

    const groupUsers = await sqldb.queryAsync('SELECT * FROM group_users', {});
    assert.equal(groupUsers.rows.length, 0);
  });
});
