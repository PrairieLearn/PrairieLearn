/**
 * NOTE: These tests depend on the `lockdown_browser_enabled` columns on
 * `pt_locations` / `pt_sessions`, which are added by PR #15087's
 * migrations. Once #15087 lands and this branch picks up those
 * migrations, the suite runs cleanly against `helperDb.before()`.
 */
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import { execute, loadSqlEquiv, queryScalar } from '@prairielearn/postgres';

import { IdSchema, UserSchema } from '../../lib/db-types.js';
import * as helperDb from '../../tests/helperDb.js';

import { selectActiveLockdownBrowserReservation } from './endExam.js';

const sql = loadSqlEquiv(import.meta.url);

let user_id: string;

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
      const id = await queryScalar(
        sql.create_active_ldb_center_reservation,
        { user_id, hours_until_end: 1 },
        IdSchema,
      );
      const result = await selectActiveLockdownBrowserReservation({
        authn_user_id: user_id,
        date: new Date(),
      });
      assert.equal(result?.id, id);
    });
  });

  it('returns the soonest-ending reservation when multiple match', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const sooner = await queryScalar(
        sql.create_active_ldb_center_reservation,
        { user_id, hours_until_end: 1 },
        IdSchema,
      );
      await queryScalar(
        sql.create_active_ldb_center_reservation,
        { user_id, hours_until_end: 3 },
        IdSchema,
      );
      const result = await selectActiveLockdownBrowserReservation({
        authn_user_id: user_id,
        date: new Date(),
      });
      assert.equal(result?.id, sooner);
    });
  });

  it('excludes reservations whose access window does not contain now', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      await execute(sql.create_expired_ldb_reservation, { user_id });
      const result = await selectActiveLockdownBrowserReservation({
        authn_user_id: user_id,
        date: new Date(),
      });
      assert.isNull(result);
    });
  });

  it('excludes reservations whose location/session do not require LDB', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      await execute(sql.create_active_non_ldb_reservation, { user_id });
      const result = await selectActiveLockdownBrowserReservation({
        authn_user_id: user_id,
        date: new Date(),
      });
      assert.isNull(result);
    });
  });

  it('returns a course-run reservation when its session has LDB enabled', async () => {
    await helperDb.runInTransactionAndRollback(async () => {
      const id = await queryScalar(sql.create_active_ldb_course_reservation, { user_id }, IdSchema);
      const result = await selectActiveLockdownBrowserReservation({
        authn_user_id: user_id,
        date: new Date(),
      });
      assert.equal(result?.id, id);
    });
  });
});
