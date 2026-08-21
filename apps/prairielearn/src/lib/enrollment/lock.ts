import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

const sql = loadSqlEquiv(import.meta.url);

function normalizeEnrollmentIds(enrollmentIds: Iterable<string>): string[] {
  return [...new Set(enrollmentIds)].sort((a, b) => {
    const aId = BigInt(a);
    const bId = BigInt(b);
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  });
}

/**
 * Locks enrollment rows in numeric ID order. Must be called within a transaction
 * before mutating rows that reference the enrollments.
 */
export async function lockEnrollments(enrollmentIds: Iterable<string>): Promise<void> {
  const normalizedEnrollmentIds = normalizeEnrollmentIds(enrollmentIds);
  if (normalizedEnrollmentIds.length === 0) return;

  await queryRows(
    sql.lock_enrollments_by_id,
    { enrollment_ids: normalizedEnrollmentIds },
    z.object({ id: IdSchema }),
  );
}
