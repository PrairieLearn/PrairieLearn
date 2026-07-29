import { execute, loadSqlEquiv, runInTransactionAsync } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

export function normalizeCourseInstanceIds(courseInstanceIds: string | string[]): string[] {
  return [
    ...new Set(Array.isArray(courseInstanceIds) ? courseInstanceIds : [courseInstanceIds]),
  ].sort((a, b) => {
    const aId = BigInt(a);
    const bId = BigInt(b);
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  });
}

/**
 * Runs individual enrollment mutations while allowing other individual
 * mutations for the same course instances to proceed concurrently. Multiple
 * IDs support course-permission deletion, which removes enrollments across all
 * instances of a course in one transaction. Nested transactions keep the
 * barriers until the outermost transaction completes.
 */
export async function runWithSharedEnrollmentBarrier<T>(
  courseInstanceIds: string | string[],
  fn: () => Promise<T>,
): Promise<T> {
  return await runInTransactionAsync(async () => {
    await execute(sql.acquire_shared_course_instance_enrollment_barrier, {
      course_instance_ids: normalizeCourseInstanceIds(courseInstanceIds),
    });

    return await fn();
  });
}

/**
 * Runs a bulk enrollment mutation while preventing other enrollment mutations
 * for the same course instances. Nested transactions keep the barriers until
 * the outermost transaction completes.
 */
export async function runWithExclusiveEnrollmentBarrier<T>(
  courseInstanceIds: string | string[],
  fn: () => Promise<T>,
): Promise<T> {
  return await runInTransactionAsync(async () => {
    await execute(sql.acquire_exclusive_course_instance_enrollment_barrier, {
      course_instance_ids: normalizeCourseInstanceIds(courseInstanceIds),
    });

    return await fn();
  });
}
