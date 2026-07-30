import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { loadSqlEquiv, queryScalar } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { UserSchema } from '../../lib/db-types.js';
import * as helperDb from '../../tests/helperDb.js';

import { selectActiveLockdownBrowserReservation } from './endExam.js';

const sql = loadSqlEquiv(import.meta.url);

let user_id: string;

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function insertLocation({
  lockdown_browser_enabled,
}: {
  lockdown_browser_enabled: boolean;
}): Promise<string> {
  return await queryScalar(sql.insert_location, { lockdown_browser_enabled }, IdSchema);
}

async function insertSession({
  location_id,
  lockdown_browser_enabled,
}: {
  location_id: string | null;
  lockdown_browser_enabled: boolean | null;
}): Promise<string> {
  return await queryScalar(sql.insert_session, { location_id, lockdown_browser_enabled }, IdSchema);
}

async function insertReservation({
  session_id,
  access_start,
  access_end,
}: {
  session_id: string;
  access_start: Date;
  access_end: Date;
}): Promise<string> {
  return await queryScalar(
    sql.insert_reservation,
    { user_id, session_id, access_start, access_end },
    IdSchema,
  );
}

describe('selectActiveLockdownBrowserReservation', () => {
  beforeAll(async () => {
    await helperDb.before();
    user_id = await queryScalar(sql.setup_user, UserSchema.shape.id);
  });

  afterAll(helperDb.after);

  it('returns null when the user has no reservations', async () => {
    const result = await selectActiveLockdownBrowserReservation({
      authn_user_id: user_id,
      date: new Date(),
    });
    assert.isNull(result);
  });

  it('returns the reservation when one is active and LDB-required', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const location_id = await insertLocation({ lockdown_browser_enabled: true });
      const session_id = await insertSession({ location_id, lockdown_browser_enabled: null });
      const id = await insertReservation({
        session_id,
        access_start: minutesFromNow(-5),
        access_end: minutesFromNow(60),
      });

      const result = await selectActiveLockdownBrowserReservation({
        authn_user_id: user_id,
        date: new Date(),
      });
      assert.equal(result?.id, id);
    });
  });

  it('returns the soonest-ending reservation when multiple match', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const soonerLocation = await insertLocation({ lockdown_browser_enabled: true });
      const soonerSession = await insertSession({
        location_id: soonerLocation,
        lockdown_browser_enabled: null,
      });
      const sooner = await insertReservation({
        session_id: soonerSession,
        access_start: minutesFromNow(-5),
        access_end: minutesFromNow(60),
      });

      const laterLocation = await insertLocation({ lockdown_browser_enabled: true });
      const laterSession = await insertSession({
        location_id: laterLocation,
        lockdown_browser_enabled: null,
      });
      await insertReservation({
        session_id: laterSession,
        access_start: minutesFromNow(-5),
        access_end: minutesFromNow(180),
      });

      const result = await selectActiveLockdownBrowserReservation({
        authn_user_id: user_id,
        date: new Date(),
      });
      assert.equal(result?.id, sooner);
    });
  });

  it('excludes reservations whose access window does not contain now', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const location_id = await insertLocation({ lockdown_browser_enabled: true });
      const session_id = await insertSession({ location_id, lockdown_browser_enabled: null });
      await insertReservation({
        session_id,
        access_start: minutesFromNow(-120),
        access_end: minutesFromNow(-60),
      });

      const result = await selectActiveLockdownBrowserReservation({
        authn_user_id: user_id,
        date: new Date(),
      });
      assert.isNull(result);
    });
  });

  it('excludes reservations whose location/session do not require LDB', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const location_id = await insertLocation({ lockdown_browser_enabled: false });
      const session_id = await insertSession({ location_id, lockdown_browser_enabled: false });
      await insertReservation({
        session_id,
        access_start: minutesFromNow(-5),
        access_end: minutesFromNow(60),
      });

      const result = await selectActiveLockdownBrowserReservation({
        authn_user_id: user_id,
        date: new Date(),
      });
      assert.isNull(result);
    });
  });

  it('returns a course-run reservation when its session has LDB enabled', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const session_id = await insertSession({
        location_id: null,
        lockdown_browser_enabled: true,
      });
      const id = await insertReservation({
        session_id,
        access_start: minutesFromNow(-5),
        access_end: minutesFromNow(60),
      });

      const result = await selectActiveLockdownBrowserReservation({
        authn_user_id: user_id,
        date: new Date(),
      });
      assert.equal(result?.id, id);
    });
  });
});
