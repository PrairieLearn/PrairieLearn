import { assert } from 'chai';
import * as sqldb from '@prairielearn/postgres';

import * as helperDb from '../helperDb';

const sql = sqldb.loadSqlEquiv(__filename);

let user_id = null;

describe('sproc ip_to_mode tests', function () {
  before('set up testing server', async function () {
    await helperDb.before.call(this);
    const result = await sqldb.queryAsync(sql.setup, {});
    user_id = result.rows[0].user_id;
  });
  after('tear down testing database', helperDb.after);

  describe('PT with checked-in reservation and IP-restricted exam', function () {
    it('should return "Exam" when we have the correct IP address', async function () {
      await helperDb.runInTransactionAndRollback(async () => {
        const result = await sqldb.callAsync('ip_to_mode', ['10.0.0.1', new Date(), user_id]);
        assert.equal(result.rows[0].mode, 'Exam');
      });
    });

    it('should return "Public" when we have the wrong IP address', async function () {
      await helperDb.runInTransactionAndRollback(async () => {
        const result = await sqldb.callAsync('ip_to_mode', ['192.168.0.1', new Date(), user_id]);
        assert.equal(result.rows[0].mode, 'Public');
      });
    });

    it('should return "Public" when we are outside the access date range', async function () {
      await helperDb.runInTransactionAndRollback(async () => {
        const result = await sqldb.callAsync('ip_to_mode', [
          '10.0.0.1',
          new Date(Date.now() + 2 * 60 * 60 * 1000),
          user_id,
        ]);
        assert.equal(result.rows[0].mode, 'Public');
      });
    });
  });

  describe('PT with checked-in reservation and non-IP-restricted exam', function () {
    it('should return "Exam" even when we have the wrong IP address', async function () {
      await helperDb.runInTransactionAndRollback(async () => {
        // Remove IP restriction.
        await sqldb.queryAsync('UPDATE pt_locations SET filter_networks = FALSE;', {});

        const result = await sqldb.callAsync('ip_to_mode', ['192.168.0.1', new Date(), user_id]);
        assert.equal(result.rows[0].mode, 'Exam');
      });
    });
  });

  describe('PT with checked-in reservation and exam without location', function () {
    it('should return "Exam" even when we have the wrong IP address', async function () {
      await helperDb.runInTransactionAndRollback(async () => {
        // Remove location to simulate a course session.
        await sqldb.queryAsync('UPDATE pt_sessions SET location_id = NULL;', {});

        const result = await sqldb.callAsync('ip_to_mode', ['192.168.0.1', new Date(), user_id]);
        assert.equal(result.rows[0].mode, 'Exam');
      });
    });
  });

  describe('PT with non-checked-in reservation and IP-restricted exam', function () {
    it('should return "Exam" with the right IP address when session is starting soon', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        await sqldb.queryAsync(sql.check_out_reservation, {});

        console.log((await sqldb.queryAsync('SELECT * FROM pt_reservations;', {})).rows);

        const result = await sqldb.callAsync('ip_to_mode', [
          '10.0.0.1',
          // 10 minutes ago.
          new Date(Date.now() - 1000 * 60 * 10),
          user_id,
        ]);
        assert.equal(result.rows[0].mode, 'Exam');
      });
    });

    it('should return "Exam" with the right IP address when session started recently', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        await sqldb.queryAsync(sql.check_out_reservation, {});

        const result = await sqldb.callAsync('ip_to_mode', [
          '10.0.0.1',
          // 10 minutes from now.
          new Date(Date.now() + 1000 * 60 * 10),
          user_id,
        ]);
        assert.equal(result.rows[0].mode, 'Exam');
      });
    });

    it('should return "Public" with the wrong IP address when session is starting soon', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        await sqldb.queryAsync(sql.check_out_reservation, {});

        const result = await sqldb.callAsync('ip_to_mode', [
          '192.168.0.1',
          // 10 minutes ago.
          new Date(Date.now() - 1000 * 60 * 10),
          user_id,
        ]);
        assert.equal(result.rows[0].mode, 'Public');
      });
    });

    it('should return "Public" with the wrong IP address when session started recently', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        await sqldb.queryAsync(sql.check_out_reservation, {});

        const result = await sqldb.callAsync('ip_to_mode', [
          '192.168.0.1',
          // 10 minutes from now.
          new Date(Date.now() + 1000 * 60 * 10),
          user_id,
        ]);
        assert.equal(result.rows[0].mode, 'Public');
      });
    });

    it('should handler multiple reservations simultaneously', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        await sqldb.queryAsync(sql.check_out_reservation, {});

        const resultA = await sqldb.callAsync('ip_to_mode', [
          '10.0.0.1',
          // 10 minutes ago.
          new Date(Date.now() - 1000 * 60 * 10),
          user_id,
        ]);
        assert.equal(resultA.rows[0].mode, 'Exam');

        const resultB = await sqldb.callAsync('ip_to_mode', [
          '10.1.1.1',
          // 10 minutes ago.
          new Date(Date.now() - 1000 * 60 * 10),
          user_id,
        ]);
        assert.equal(resultB.rows[0].mode, 'Exam');
      });
    });
  });
});
