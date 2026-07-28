import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { execute, loadSqlEquiv, runInTransactionAsync } from '@prairielearn/postgres';

import * as helperDb from '../tests/helperDb.js';

import {
  normalizeCourseInstanceIds,
  runWithSharedEnrollmentBarrier,
} from './enrollment-barrier.js';

const sql = loadSqlEquiv(import.meta.url);

function deferred() {
  let resolve: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: resolve! };
}

describe('course-instance enrollment barriers', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  it('deduplicates and sorts course instance IDs numerically', () => {
    expect(normalizeCourseInstanceIds(['100', '20', '3', '20'])).toEqual(['3', '20', '100']);
  });

  it('holds a nested shared barrier until the outer transaction completes', async () => {
    const held = deferred();
    const release = deferred();
    const holder = runInTransactionAsync(async () => {
      await runWithSharedEnrollmentBarrier('2147483648', async () => {});
      held.resolve();
      await release.promise;
    });
    await held.promise;

    try {
      await expect(
        runInTransactionAsync(async () => {
          await execute(sql.set_short_lock_timeout);
          await execute(sql.acquire_exclusive_course_instance_enrollment_barrier, {
            course_instance_id: '2147483648',
          });
        }),
      ).rejects.toMatchObject({ code: '55P03' });
    } finally {
      release.resolve();
      await holder;
    }
  });
});
