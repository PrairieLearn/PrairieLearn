// @ts-check
const assert = require('chai').assert;
const util = require('node:util');
const sqldb = require('@prairielearn/postgres');
const { step } = require('mocha-steps');

const helperServer = require('./helperServer');
const { deleteAllGroups } = require('../lib/groups');
const groupUpdate = require('../lib/group-update');
const { TEST_COURSE_PATH } = require('../lib/paths');

const sql = sqldb.loadSqlEquiv(__filename);
const locals = {};

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
    const user_id = 1;
    const authn_user_id = 1;
    const max_group_size = 10;
    const min_group_size = 10;
    const option = 1;
    const job_sequence_id = await util.promisify(groupUpdate.autoGroups)(
      locals.assessment_id,
      user_id,
      authn_user_id,
      max_group_size,
      min_group_size,
      option,
    );
    await helperServer.waitForJobSequenceAsync(job_sequence_id);
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
