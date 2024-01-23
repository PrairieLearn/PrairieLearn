import { assert } from 'chai';
import * as sqldb from '@prairielearn/postgres';

import * as helperDb from '../helperDb';

const sql = sqldb.loadSqlEquiv(__filename);

describe('sproc check_course_instance_access* tests', function () {
  before('set up testing server', helperDb.before);
  after('tear down testing database', helperDb.after);

  before('setup sample environment', async () => {
    await sqldb.queryAsync(sql.setup_cia_generic_tests, {});
  });

  it('pass if all parameters match', async () => {
    const result = await sqldb.queryAsync(sql.ciar_test, {
      uid: 'person1@host.com',
      date: '2010-07-07 06:06:06-00',
      ciar_id: 1,
      short_name: 'host',
    });

    assert.strictEqual(result.rows[0].authorized, true);
  });

  it('fail if uid (from school institution) not in list', async () => {
    const result = await sqldb.queryAsync(sql.ciar_test, {
      uid: 'user@school.edu',
      date: '2010-07-07 06:06:06-00',
      ciar_id: 1,
      short_name: 'school',
    });

    assert.strictEqual(result.rows[0].authorized, false);
  });

  it('fail if uid (from host institution) not in list', async () => {
    const result = await sqldb.queryAsync(sql.ciar_test, {
      uid: 'unknown@host.com',
      date: '2010-07-07 06:06:06-00',
      ciar_id: 1,
      short_name: 'host',
    });

    assert.strictEqual(result.rows[0].authorized, false);
  });

  it('fail if date is before start_date', async () => {
    const result = await sqldb.queryAsync(sql.ciar_test, {
      uid: 'person1@host.com',
      date: '2007-07-07 06:06:06-00',
      ciar_id: 1,
      short_name: 'host',
    });

    assert.strictEqual(result.rows[0].authorized, false);
  });

  it('fail if date is after end_date', async () => {
    const result = await sqldb.queryAsync(sql.ciar_test, {
      uid: 'person1@host.com',
      date: '2017-07-07 06:06:06-00',
      ciar_id: 1,
      short_name: 'host',
    });

    assert.strictEqual(result.rows[0].authorized, false);
  });

  it('pass if institution matches', async () => {
    const result = await sqldb.queryAsync(sql.ciar_test, {
      uid: 'person1@school.edu',
      date: '2011-07-07 06:06:06-00',
      ciar_id: 2,
      short_name: 'school',
    });

    assert.strictEqual(result.rows[0].authorized, true);
  });

  it('fail if institution specified and does not match', async () => {
    const result = await sqldb.queryAsync(sql.ciar_test, {
      uid: 'person1@anotherschool.edu',
      date: '2011-07-07 06:06:06-00',
      ciar_id: 2,
      short_name: 'anotherschool',
    });

    assert.strictEqual(result.rows[0].authorized, false);
  });

  it('fail if institution specified in rule is not in db', async () => {
    const result = await sqldb.queryAsync(sql.ciar_test, {
      uid: 'person1@anotherschool.edu',
      date: '2011-07-07 06:06:06-00',
      ciar_id: 3,
      short_name: 'anotherschool',
    });

    assert.strictEqual(result.rows[0].authorized, false);
  });

  it('pass if user matches course institution', async () => {
    const result = await sqldb.queryAsync(sql.ciar_test, {
      uid: 'person1@school.edu',
      date: '2013-07-07 06:06:06-00',
      ciar_id: 4,
      short_name: 'school',
    });

    assert.strictEqual(result.rows[0].authorized, true);
  });

  it('fail if user does not match course institution', async () => {
    const result = await sqldb.queryAsync(sql.ciar_test, {
      uid: 'person1@school.edu',
      date: '2013-07-07 06:06:06-00',
      ciar_id: 4,
      short_name: 'anotherschool',
    });

    assert.strictEqual(result.rows[0].authorized, false);
  });

  it('fail if institution=LTI and user is not created with a course instance', async () => {
    const result = await sqldb.queryAsync(sql.ciar_test, {
      uid: 'normaluser@host.com',
      date: '2013-07-07 06:06:06-00',
      ciar_id: 5,
      short_name: 'host',
    });

    assert.strictEqual(result.rows[0].authorized, false);
  });

  it('pass if institution=LTI and user is created with correct course instance', async () => {
    const result = await sqldb.queryAsync(sql.ciar_test, {
      uid: 'ltiuserci1@host.com',
      date: '2013-07-07 06:06:06-00',
      ciar_id: 5,
      short_name: 'host',
    });

    assert.strictEqual(result.rows[0].authorized, true);
  });

  it('fail if institution=LTI and user is created with a different course instance', async () => {
    const result = await sqldb.queryAsync(sql.ciar_test, {
      uid: 'ltiuserci2@host.com',
      date: '2013-07-07 06:06:06-00',
      ciar_id: 5,
      short_name: 'host',
    });

    assert.strictEqual(result.rows[0].authorized, false);
  });

  it('fail if date is after end_date and LTI matches', async () => {
    const result = await sqldb.queryAsync(sql.ciar_test, {
      uid: 'ltiuserci1@host.com',
      date: '2017-07-07 06:06:06-00',
      ciar_id: 5,
      short_name: 'host',
    });

    assert.strictEqual(result.rows[0].authorized, false);
  });
});
