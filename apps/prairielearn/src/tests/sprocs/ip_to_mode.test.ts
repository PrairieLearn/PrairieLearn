import { assert } from 'chai';
import * as sqldb from '@prairielearn/postgres';

import * as helperDb from '../helperDb';

const sql = sqldb.loadSqlEquiv(__filename);

let user_id = null;

describe('sproc ip_to_mode tests', function () {
  before('set up testing server', helperDb.before);
  after('tear down testing database', helperDb.after);

  beforeEach('setup sample environment', async function () {
    await sqldb.queryAsync(sql.clear, {});
    const result = await sqldb.queryAsync(sql.setup, {});
    user_id = result.rows[0].user_id;
  });

  describe('PT with checked-in reservation and IP-restricted exam', function () {
    it('should return "Exam" when we have the correct IP address', async function () {
      const result = await sqldb.callAsync('ip_to_mode', ['10.0.0.1', new Date(), user_id]);
      assert.equal(result.rows[0].mode, 'Exam');
    });

    it('should return "Public" when we have the wrong IP address', async function () {
      const result = await sqldb.callAsync('ip_to_mode', ['192.168.0.1', new Date(), user_id]);
      assert.equal(result.rows[0].mode, 'Public');
    });

    it('should return "Public" when we are outside the access date range', async function () {
      const result = await sqldb.callAsync('ip_to_mode', [
        '10.0.0.1',
        new Date(Date.now() + 2 * 60 * 60 * 1000),
        user_id,
      ]);
      assert.equal(result.rows[0].mode, 'Public');
    });
  });

  describe('PT with checked-in reservation and IP-UNrestricted exam', function () {
    beforeEach('remove IP restriction', async function () {
      await sqldb.queryAsync('UPDATE pt_locations SET filter_networks = FALSE;', {});
    });

    it('should return "Exam" even when we have the wrong IP address', async function () {
      const result = await sqldb.callAsync('ip_to_mode', ['192.168.0.1', new Date(), user_id]);
      assert.equal(result.rows[0].mode, 'Exam');
    });
  });

  describe('PT with checked-in reservation and exam without location', function () {
    beforeEach('remove IP restriction', async function () {
      await sqldb.queryAsync('UPDATE pt_sessions SET location_id = NULL;', {});
    });

    it('should return "Exam" even when we have the wrong IP address', async function () {
      const result = await sqldb.callAsync('ip_to_mode', ['192.168.0.1', new Date(), user_id]);
      assert.equal(result.rows[0].mode, 'Exam');
    });
  });
});
