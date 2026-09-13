import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { execute, loadSqlEquiv, runInTransactionAsync } from '@prairielearn/postgres';
import { withResolvers } from '@prairielearn/utils';

import * as helperDb from '../../tests/helperDb.js';

import {
  normalizeCourseInstanceIds,
  runWithExclusiveEnrollmentBarrier,
  runWithSharedEnrollmentBarrier,
} from './barrier.js';

const sql = loadSqlEquiv(import.meta.url);

// PostgreSQL SQLSTATE for lock_not_available.
const POSTGRES_LOCK_NOT_AVAILABLE = '55P03';

describe('course-instance enrollment barriers', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  it('deduplicates and sorts course instance IDs numerically', () => {
    expect(normalizeCourseInstanceIds(['100', '20', '3', '20'])).toEqual(['3', '20', '100']);
  });

  it('holds a nested shared barrier until the outer transaction completes', async () => {
    const held = withResolvers<undefined>();
    const release = withResolvers<undefined>();
    const holder = runInTransactionAsync(async () => {
      await runWithSharedEnrollmentBarrier(['2147483648', '2147483649'], async () => {});
      held.resolve(undefined);
      await release.promise;
    });
    await held.promise;

    try {
      await expect(
        runInTransactionAsync(async () => {
          await execute(sql.set_short_lock_timeout);
          await runWithSharedEnrollmentBarrier('2147483649', async () => {});
        }),
      ).resolves.toBeUndefined();
      await expect(
        runInTransactionAsync(async () => {
          await execute(sql.set_short_lock_timeout);
          await runWithExclusiveEnrollmentBarrier('2147483649', async () => {});
        }),
      ).rejects.toMatchObject({ code: POSTGRES_LOCK_NOT_AVAILABLE });
    } finally {
      release.resolve(undefined);
      await holder;
    }
  });
});
