import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { execute, loadSqlEquiv, runInTransactionAsync } from '@prairielearn/postgres';

import * as helperDb from '../tests/helperDb.js';

import {
  normalizeCourseInstanceIds,
  runWithExclusiveEnrollmentBarrier,
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

async function expectLockTimeout(fn: () => Promise<void>) {
  await expect(
    runInTransactionAsync(async () => {
      await execute(sql.set_short_lock_timeout);
      await fn();
    }),
  ).rejects.toMatchObject({ code: '55P03' });
}

describe('course-instance enrollment barriers', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  it('deduplicates and sorts course instance IDs numerically', () => {
    expect(normalizeCourseInstanceIds(['100', '20', '3', '20'])).toEqual(['3', '20', '100']);
  });

  it('allows shared barriers for the same course instance to coexist', async () => {
    const held = deferred();
    const release = deferred();
    const holder = runWithSharedEnrollmentBarrier('1000000001', async () => {
      held.resolve();
      await release.promise;
    });
    await held.promise;

    try {
      await runInTransactionAsync(async () => {
        await execute(sql.set_short_lock_timeout);
        await runWithSharedEnrollmentBarrier('1000000001', async () => {});
      });
    } finally {
      release.resolve();
      await holder;
    }
  });

  it('holds a nested barrier until the outer transaction completes', async () => {
    const held = deferred();
    const release = deferred();
    const holder = runInTransactionAsync(async () => {
      await runWithSharedEnrollmentBarrier('1000000008', async () => {});
      held.resolve();
      await release.promise;
    });
    await held.promise;

    try {
      await expectLockTimeout(async () => {
        await runWithExclusiveEnrollmentBarrier('1000000008', async () => {});
      });
    } finally {
      release.resolve();
      await holder;
    }
  });

  it('blocks an exclusive barrier behind a shared barrier', async () => {
    const held = deferred();
    const release = deferred();
    const holder = runWithSharedEnrollmentBarrier('1000000002', async () => {
      held.resolve();
      await release.promise;
    });
    await held.promise;

    try {
      await expectLockTimeout(async () => {
        await runWithExclusiveEnrollmentBarrier('1000000002', async () => {});
      });
    } finally {
      release.resolve();
      await holder;
    }
  });

  it('blocks a shared barrier behind an exclusive barrier', async () => {
    const held = deferred();
    const release = deferred();
    const holder = runWithExclusiveEnrollmentBarrier('1000000003', async () => {
      held.resolve();
      await release.promise;
    });
    await held.promise;

    try {
      await expectLockTimeout(async () => {
        await runWithSharedEnrollmentBarrier('1000000003', async () => {});
      });
    } finally {
      release.resolve();
      await holder;
    }
  });

  it('does not block operations for a different course instance', async () => {
    const held = deferred();
    const release = deferred();
    const holder = runWithExclusiveEnrollmentBarrier('1000000004', async () => {
      held.resolve();
      await release.promise;
    });
    await held.promise;

    try {
      await runInTransactionAsync(async () => {
        await execute(sql.set_short_lock_timeout);
        await runWithSharedEnrollmentBarrier('1000000005', async () => {});
      });
    } finally {
      release.resolve();
      await holder;
    }
  });

  it('releases barriers when the transaction rolls back', async () => {
    await expect(
      runWithExclusiveEnrollmentBarrier('1000000006', async () => {
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    await runInTransactionAsync(async () => {
      await execute(sql.set_short_lock_timeout);
      await runWithSharedEnrollmentBarrier('1000000006', async () => {});
    });
  });

  it('releases barriers when the transaction commits', async () => {
    await runWithExclusiveEnrollmentBarrier('1000000007', async () => {});

    await runInTransactionAsync(async () => {
      await execute(sql.set_short_lock_timeout);
      await runWithSharedEnrollmentBarrier('1000000007', async () => {});
    });
  });
});
