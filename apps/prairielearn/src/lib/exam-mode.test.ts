import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { execute, loadSqlEquiv, queryScalar } from '@prairielearn/postgres';

import * as helperDb from '../tests/helperDb.js';

import { UserSchema } from './db-types.js';
import { ipToMode } from './exam-mode.js';

const sql = loadSqlEquiv(import.meta.url);

let authn_user_id: string;

async function createCenterExamReservation() {
  await execute(sql.create_center_exam_reservation, { user_id: authn_user_id });
}

async function createCourseExamReservation() {
  await execute(sql.create_course_exam_reservation, { user_id: authn_user_id });
}

describe('ipToMode tests', function () {
  beforeAll(async function () {
    await helperDb.before();
    authn_user_id = await queryScalar(sql.setup, UserSchema.shape.id);
  });

  afterAll(helperDb.after);

  describe('No reservations', () => {
    it('should return "Public"', async () => {
      const result = await ipToMode({ ip: '10.0.0.1', date: new Date(), authn_user_id });
      assert.equal(result, 'Public');
    });
  });

  describe('Center exam with IP restrictions', () => {
    describe('before check-in', { timeout: 20_000 }, () => {
      // This test is oddly flaky in CI (it times out), but not locally. In an
      // effort to figure out what's happening, we're temporarily adding some
      // extra logging here.
      it('should return "Exam" with a correct IP address when session is starting soon', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          const result = await ipToMode({
            ip: '10.0.0.1',
            // 10 minutes ago.
            date: new Date(Date.now() - 1000 * 60 * 10),
            authn_user_id,
          });
          assert.equal(result, 'Exam');
        });
      });

      it('should return "Exam" with a correct IP address when session started recently', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          const result = await ipToMode({
            ip: '10.0.0.1',
            // 10 minutes from now.
            date: new Date(Date.now() + 1000 * 60 * 10),
            authn_user_id,
          });
          assert.equal(result, 'Exam');
        });
      });

      it('should return "Public" with an incorrect IP address when session is starting soon', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          const result = await ipToMode({
            ip: '192.168.0.1',
            // 10 minutes ago.
            date: new Date(Date.now() - 1000 * 60 * 10),
            authn_user_id,
          });
          assert.equal(result, 'Public');
        });
      });

      it('should return "Public" with an incorrect IP address when session started recently', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          const result = await ipToMode({
            ip: '192.168.0.1',
            // 10 minutes from now.
            date: new Date(Date.now() + 1000 * 60 * 10),
            authn_user_id,
          });
          assert.equal(result, 'Public');
        });
      });

      it('should handle multiple reservations simultaneously', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          // Add another exam/session/location/reservation.
          await execute(sql.insert_second_reservation, { user_id: authn_user_id });

          const firstSessionInLocation = await ipToMode({
            ip: '10.0.0.1',
            // 10 minutes ago.
            date: new Date(Date.now() - 1000 * 60 * 10),
            authn_user_id,
          });
          assert.equal(firstSessionInLocation, 'Exam');

          const secondSessionInLocation = await ipToMode({
            ip: '10.1.1.1',
            // 10 minutes ago.
            date: new Date(Date.now() - 1000 * 60 * 10),
            authn_user_id,
          });
          assert.equal(secondSessionInLocation, 'Exam');

          const notInLocation = await ipToMode({
            ip: '192.168.0.1',
            // 10 minutes ago.
            date: new Date(Date.now() - 1000 * 60 * 10),
            authn_user_id,
          });
          assert.equal(notInLocation, 'Public');
        });
      });
    });

    describe('after check-in, before access start', () => {
      it('should return "Exam" with the correct IP address', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();
          await execute(sql.check_in_reservations);

          const result = await ipToMode({ ip: '10.0.0.1', date: new Date(), authn_user_id });
          assert.equal(result, 'Exam');
        });
      });

      it('should return "Public" with a correct IP address a long time after check-in', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();
          await execute(sql.check_in_reservations);

          const result = await ipToMode({
            ip: '10.0.0.1',
            date: new Date(Date.now() + 2 * 60 * 60 * 1000),
            authn_user_id,
          });
          assert.equal(result, 'Public');
        });
      });

      it('should return "Public" with an incorrect IP address', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();
          await execute(sql.check_in_reservations);

          const result = await ipToMode({ ip: '192.168.0.1', date: new Date(), authn_user_id });
          assert.equal(result, 'Public');
        });
      });
    });

    describe('after access start', () => {
      it('should return "Exam" with the right IP address, within the access date range', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();
          await execute(sql.start_reservations);

          const result = await ipToMode({ ip: '10.0.0.1', date: new Date(), authn_user_id });
          assert.equal(result, 'Exam');
        });
      });

      it('should return "Exam" with the right IP address, shortly after the access date range', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();
          await execute(sql.start_reservations);

          const result = await ipToMode({
            ip: '10.0.0.1',
            // 25 minutes from now (5 minutes after access end)
            date: new Date(Date.now() + 1000 * 60 * 25),
            authn_user_id,
          });
          assert.equal(result, 'Exam');
        });
      });

      it('should return "Public" with the right IP address, a long time after the access date range', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();
          await execute(sql.start_reservations);

          const result = await ipToMode({
            ip: '10.0.0.1',
            // 60 minutes from now (40 minutes after access end)
            date: new Date(Date.now() + 1000 * 60 * 60),
            authn_user_id,
          });
          assert.equal(result, 'Public');
        });
      });

      it('should return "Public" with the wrong IP address', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();
          await execute(sql.start_reservations);

          const result = await ipToMode({ ip: '192.168.0.1', date: new Date(), authn_user_id });
          assert.equal(result, 'Public');
        });
      });
    });
  });

  describe('Center exam without IP restrictions', () => {
    describe('before check-in', () => {
      it('should return "Public" for any IP address when session is starting soon', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          // Remove IP restriction.
          await execute('UPDATE pt_locations SET filter_networks = FALSE;');

          const result = await ipToMode({
            ip: '192.168.0.1',
            // 10 minutes ago.
            date: new Date(Date.now() - 1000 * 60 * 10),
            authn_user_id,
          });
          assert.equal(result, 'Public');
        });
      });

      it('should return "Public" for any IP address when session started recently', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          // Remove IP restriction.
          await execute('UPDATE pt_locations SET filter_networks = FALSE;');

          const result = await ipToMode({
            ip: '192.168.0.1',
            // 10 minutes from now.
            date: new Date(Date.now() + 1000 * 60 * 10),
            authn_user_id,
          });
          assert.equal(result, 'Public');
        });
      });
    });

    describe('after check-in, before access start', () => {
      it('should return "Exam" for any IP address', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          // Remove IP restriction.
          await execute('UPDATE pt_locations SET filter_networks = FALSE;');

          await execute(sql.check_in_reservations);

          const result = await ipToMode({ ip: '192.168.0.1', date: new Date(), authn_user_id });
          assert.equal(result, 'Exam');
        });
      });
    });

    describe('after access start', () => {
      it('should return "Exam" for any IP address, within the access date range', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          // Remove IP restriction.
          await execute('UPDATE pt_locations SET filter_networks = FALSE;');

          await execute(sql.start_reservations);

          const result = await ipToMode({ ip: '192.168.0.01', date: new Date(), authn_user_id });
          assert.equal(result, 'Exam');
        });
      });

      it('should return "Public" for any IP address, outside the access date range', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          // Remove IP restriction.
          await execute('UPDATE pt_locations SET filter_networks = FALSE;');

          await execute(sql.start_reservations);

          const result = await ipToMode({
            ip: '192.168.0.01',
            // 90 minutes from now.
            date: new Date(Date.now() + 1000 * 60 * 90),
            authn_user_id,
          });
          assert.equal(result, 'Public');
        });
      });

      it('should return "Public" for any IP address, outside the access date range but within an hour of check-in', async () => {
        await helperDb.runInTransactionAndRollback(async () => {
          await createCenterExamReservation();

          // Remove IP restriction.
          await execute('UPDATE pt_locations SET filter_networks = FALSE;');

          await execute(sql.check_in_reservations);
          await execute(sql.start_reservations);

          const result = await ipToMode({
            ip: '192.168.0.01',
            // 50 minutes from now.
            date: new Date(Date.now() + 1000 * 60 * 50),
            authn_user_id,
          });
          assert.equal(result, 'Public');
        });
      });
    });
  });

  describe('Course exam', () => {
    it('should return "Exam" after check-in and before access start', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        await createCourseExamReservation();

        await execute(sql.check_in_reservations);

        const result = await ipToMode({ ip: '192.168.0.1', date: new Date(), authn_user_id });
        assert.equal(result, 'Exam');
      });
    });

    it('should return "Exam" after access start with check-in', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        await createCourseExamReservation();

        await execute(sql.check_in_reservations);
        await execute(sql.start_reservations);

        const result = await ipToMode({ ip: '192.168.0.1', date: new Date(), authn_user_id });
        assert.equal(result, 'Exam');
      });
    });

    it('should return "Exam" after access start without check-in', async () => {
      await helperDb.runInTransactionAndRollback(async () => {
        await createCourseExamReservation();

        await execute(sql.start_reservations);

        const result = await ipToMode({ ip: '192.168.0.1', date: new Date(), authn_user_id });
        assert.equal(result, 'Exam');
      });
    });
  });
});
