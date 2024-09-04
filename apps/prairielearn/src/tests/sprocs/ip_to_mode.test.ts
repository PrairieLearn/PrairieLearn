import { assert } from 'chai';

import * as sqldb from '@prairielearn/postgres';

import * as helperDb from '../helperDb.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

let user_id = null;

async function createCenterExamReservation() {
  await sqldb.queryAsync(sql.create_center_exam_reservation, { user_id });
}

async function createCourseExamReservation() {
  await sqldb.queryAsync(sql.create_course_exam_reservation, { user_id });
}

describe('sproc ip_to_mode tests', function () {
  before('set up testing server', async function () {
    await helperDb.before.call(this);
    const result = await sqldb.queryAsync(sql.setup, {});
    user_id = result.rows[0].user_id;
  });
  after('tear down testing database', helperDb.after);

  describe('No reservations', () => {
    it('should return "Public"', async () => {
      const result = await sqldb.callAsync('ip_to_mode', ['10.0.0.1', new Date(), user_id]);
      assert.equal(result.rows[0].mode, 'Public');
      assert.equal(result.rows[0].mode_reason, 'Default');
    });
  });

  describe('Center exam with IP restrictions', () => {
    describe('before check-in', () => {
      it('should return "Exam" with a correct IP address when session is starting soon', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          const result = await sqldb.callAsync('ip_to_mode', [
            '10.0.0.1',
            // 10 minutes ago.
            new Date(Date.now() - 1000 * 60 * 10),
            user_id,
          ]);
          assert.equal(result.rows[0].mode, 'Exam');
          assert.equal(result.rows[0].mode_reason, 'PrairieTest');
        });
      });

      it('should return "Exam" with a correct IP address when session started recently', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          const result = await sqldb.callAsync('ip_to_mode', [
            '10.0.0.1',
            // 10 minutes from now.
            new Date(Date.now() + 1000 * 60 * 10),
            user_id,
          ]);
          assert.equal(result.rows[0].mode, 'Exam');
          assert.equal(result.rows[0].mode_reason, 'PrairieTest');
        });
      });

      it('should return "Public" with an incorrect IP address when session is starting soon', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          const result = await sqldb.callAsync('ip_to_mode', [
            '192.168.0.1',
            // 10 minutes ago.
            new Date(Date.now() - 1000 * 60 * 10),
            user_id,
          ]);
          assert.equal(result.rows[0].mode, 'Public');
          assert.equal(result.rows[0].mode_reason, 'Default');
        });
      });

      it('should return "Public" with an incorrect IP address when session started recently', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          const result = await sqldb.callAsync('ip_to_mode', [
            '192.168.0.1',
            // 10 minutes from now.
            new Date(Date.now() + 1000 * 60 * 10),
            user_id,
          ]);
          assert.equal(result.rows[0].mode, 'Public');
          assert.equal(result.rows[0].mode_reason, 'Default');
        });
      });

      it('should handle multiple reservations simultaneously', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          // Add another exam/session/location/reservation.
          await sqldb.queryAsync(sql.insert_second_reservation, { user_id });

          const firstSessionInLocation = await sqldb.callAsync('ip_to_mode', [
            '10.0.0.1',
            // 10 minutes ago.
            new Date(Date.now() - 1000 * 60 * 10),
            user_id,
          ]);
          assert.equal(firstSessionInLocation.rows[0].mode, 'Exam');
          assert.equal(firstSessionInLocation.rows[0].mode_reason, 'PrairieTest');

          const secondSessionInLocation = await sqldb.callAsync('ip_to_mode', [
            '10.1.1.1',
            // 10 minutes ago.
            new Date(Date.now() - 1000 * 60 * 10),
            user_id,
          ]);
          assert.equal(secondSessionInLocation.rows[0].mode, 'Exam');
          assert.equal(secondSessionInLocation.rows[0].mode_reason, 'PrairieTest');

          const notInLocation = await sqldb.callAsync('ip_to_mode', [
            '192.168.0.1',
            // 10 minutes ago.
            new Date(Date.now() - 1000 * 60 * 10),
            user_id,
          ]);
          assert.equal(notInLocation.rows[0].mode, 'Public');
          assert.equal(notInLocation.rows[0].mode_reason, 'Default');
        });
      });
    });

    describe('after check-in, before access start', () => {
      it('should return "Exam" with the correct IP address', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();
          await sqldb.queryAsync(sql.check_in_reservations, {});

          const result = await sqldb.callAsync('ip_to_mode', ['10.0.0.1', new Date(), user_id]);
          assert.equal(result.rows[0].mode, 'Exam');
          assert.equal(result.rows[0].mode_reason, 'PrairieTest');
        });
      });

      it('should return "Public" with a correct IP address a long time after check-in', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();
          await sqldb.queryAsync(sql.check_in_reservations, {});

          const result = await sqldb.callAsync('ip_to_mode', [
            '10.0.0.1',
            new Date(Date.now() + 2 * 60 * 60 * 1000),
            user_id,
          ]);
          assert.equal(result.rows[0].mode, 'Public');
          assert.equal(result.rows[0].mode_reason, 'Default');
        });
      });

      it('should return "Public" with an incorrect IP address', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();
          await sqldb.queryAsync(sql.check_in_reservations, {});

          const result = await sqldb.callAsync('ip_to_mode', ['192.168.0.1', new Date(), user_id]);
          assert.equal(result.rows[0].mode, 'Public');
          assert.equal(result.rows[0].mode_reason, 'Default');
        });
      });
    });

    describe('after access start', () => {
      it('should return "Exam" with the right IP address, within the access date range', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();
          await sqldb.queryAsync(sql.start_reservations, {});

          const result = await sqldb.callAsync('ip_to_mode', ['10.0.0.1', new Date(), user_id]);
          assert.equal(result.rows[0].mode, 'Exam');
          assert.equal(result.rows[0].mode_reason, 'PrairieTest');
        });
      });

      it('should return "Exam" with the right IP address, shortly after the access date range', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();
          await sqldb.queryAsync(sql.start_reservations, {});

          const result = await sqldb.callAsync('ip_to_mode', [
            '10.0.0.1',
            // 25 minutes from now (5 minutes after access end)
            new Date(Date.now() + 1000 * 60 * 25),
            user_id,
          ]);
          assert.equal(result.rows[0].mode, 'Exam');
          assert.equal(result.rows[0].mode_reason, 'PrairieTest');
        });
      });

      it('should return "Public" with the right IP address, a long time after the access date range', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();
          await sqldb.queryAsync(sql.start_reservations, {});

          const result = await sqldb.callAsync('ip_to_mode', [
            '10.0.0.1',
            // 60 minutes from now (40 minutes after access end)
            new Date(Date.now() + 1000 * 60 * 60),
            user_id,
          ]);
          assert.equal(result.rows[0].mode, 'Public');
          assert.equal(result.rows[0].mode_reason, 'Default');
        });
      });

      it('should return "Public" with the wrong IP address', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();
          await sqldb.queryAsync(sql.start_reservations, {});

          const result = await sqldb.callAsync('ip_to_mode', ['192.168.0.1', new Date(), user_id]);
          assert.equal(result.rows[0].mode, 'Public');
          assert.equal(result.rows[0].mode_reason, 'Default');
        });
      });
    });
  });

  describe('Center exam without IP restrictions', () => {
    describe('before check-in', async () => {
      it('should return "Public" for any IP address when session is starting soon', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          // Remove IP restriction.
          await sqldb.queryAsync('UPDATE pt_locations SET filter_networks = FALSE;', {});

          const result = await sqldb.callAsync('ip_to_mode', [
            '192.168.0.1',
            // 10 minutes ago.
            new Date(Date.now() - 1000 * 60 * 10),
            user_id,
          ]);
          assert.equal(result.rows[0].mode, 'Public');
          assert.equal(result.rows[0].mode_reason, 'Default');
        });
      });

      it('should return "Public" for any IP address when session started recently', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          // Remove IP restriction.
          await sqldb.queryAsync('UPDATE pt_locations SET filter_networks = FALSE;', {});

          const result = await sqldb.callAsync('ip_to_mode', [
            '192.168.0.1',
            // 10 minutes from now.
            new Date(Date.now() + 1000 * 60 * 10),
            user_id,
          ]);
          assert.equal(result.rows[0].mode, 'Public');
          assert.equal(result.rows[0].mode_reason, 'Default');
        });
      });
    });

    describe('after check-in, before access start', async () => {
      it('should return "Exam" for any IP address', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          // Remove IP restriction.
          await sqldb.queryAsync('UPDATE pt_locations SET filter_networks = FALSE;', {});

          await sqldb.queryAsync(sql.check_in_reservations, {});

          const result = await sqldb.callAsync('ip_to_mode', ['192.168.0.1', new Date(), user_id]);
          assert.equal(result.rows[0].mode, 'Exam');
          assert.equal(result.rows[0].mode_reason, 'PrairieTest');
        });
      });
    });

    describe('after access start', async () => {
      it('should return "Exam" for any IP address, within the access date range', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          // Remove IP restriction.
          await sqldb.queryAsync('UPDATE pt_locations SET filter_networks = FALSE;', {});

          await sqldb.queryAsync(sql.start_reservations, {});

          const result = await sqldb.callAsync('ip_to_mode', ['192.168.0.01', new Date(), user_id]);
          assert.equal(result.rows[0].mode, 'Exam');
          assert.equal(result.rows[0].mode_reason, 'PrairieTest');
        });
      });

      it('should return "Public" for any IP address, outside the access date range', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          // Remove IP restriction.
          await sqldb.queryAsync('UPDATE pt_locations SET filter_networks = FALSE;', {});

          await sqldb.queryAsync(sql.start_reservations, {});

          const result = await sqldb.callAsync('ip_to_mode', [
            '192.168.0.01',
            // 90 minutes from now.
            new Date(Date.now() + 1000 * 60 * 90),
            user_id,
          ]);
          assert.equal(result.rows[0].mode, 'Public');
          assert.equal(result.rows[0].mode_reason, 'Default');
        });
      });

      it('should return "Public" for any IP address, outside the access date range but within an hour of check-in', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          // Remove IP restriction.
          await sqldb.queryAsync('UPDATE pt_locations SET filter_networks = FALSE;', {});

          await sqldb.queryAsync(sql.check_in_reservations, {});
          await sqldb.queryAsync(sql.start_reservations, {});

          const result = await sqldb.callAsync('ip_to_mode', [
            '192.168.0.01',
            // 50 minutes from now.
            new Date(Date.now() + 1000 * 60 * 50),
            user_id,
          ]);
          assert.equal(result.rows[0].mode, 'Public');
        });
      });
    });
  });

  describe('Course exam', () => {
    it('should return "Exam" after check-in and before access start', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        await createCourseExamReservation();

        await sqldb.queryAsync(sql.check_in_reservations, {});

        const result = await sqldb.callAsync('ip_to_mode', ['192.168.0.1', new Date(), user_id]);
        assert.equal(result.rows[0].mode, 'Exam');
        assert.equal(result.rows[0].mode_reason, 'PrairieTest');
      });
    });

    it('should return "Exam" after access start with check-in', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        await createCourseExamReservation();

        await sqldb.queryAsync(sql.check_in_reservations, {});
        await sqldb.queryAsync(sql.start_reservations, {});

        const result = await sqldb.callAsync('ip_to_mode', ['192.168.0.1', new Date(), user_id]);
        assert.equal(result.rows[0].mode, 'Exam');
        assert.equal(result.rows[0].mode_reason, 'PrairieTest');
      });
    });

    it('should return "Exam" after access start without check-in', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        await createCourseExamReservation();

        await sqldb.queryAsync(sql.start_reservations, {});

        const result = await sqldb.callAsync('ip_to_mode', ['192.168.0.1', new Date(), user_id]);
        assert.equal(result.rows[0].mode, 'Exam');
        assert.equal(result.rows[0].mode_reason, 'PrairieTest');
      });
    });
  });
});
