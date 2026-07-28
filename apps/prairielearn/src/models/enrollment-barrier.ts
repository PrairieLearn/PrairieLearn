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
 * Nested transactions reuse their outer transaction, so the barriers remain
 * held until the outermost transaction commits or rolls back.
 */
async function runWithCourseInstanceEnrollmentBarrier<T>({
  courseInstanceIds,
  exclusive,
  fn,
}: {
  courseInstanceIds: string | string[];
  exclusive: boolean;
  fn: () => Promise<T>;
}): Promise<T> {
  return await runInTransactionAsync(async () => {
    const lockSql = exclusive
      ? sql.acquire_exclusive_course_instance_enrollment_barrier
      : sql.acquire_shared_course_instance_enrollment_barrier;

    for (const courseInstanceId of normalizeCourseInstanceIds(courseInstanceIds)) {
      await execute(lockSql, { course_instance_id: courseInstanceId });
    }

    return await fn();
  });
}

/**
 * Runs individual enrollment mutations while allowing other individual
 * mutations for the same course instances to proceed concurrently.
 */
export async function runWithSharedEnrollmentBarrier<T>(
  courseInstanceIds: string | string[],
  fn: () => Promise<T>,
): Promise<T> {
  return await runWithCourseInstanceEnrollmentBarrier({
    courseInstanceIds,
    exclusive: false,
    fn,
  });
}

/**
 * Runs a bulk enrollment operation while excluding individual enrollment
 * mutations for the given course instances.
 */
export async function runWithExclusiveEnrollmentBarrier<T>(
  courseInstanceIds: string | string[],
  fn: () => Promise<T>,
): Promise<T> {
  return await runWithCourseInstanceEnrollmentBarrier({
    courseInstanceIds,
    exclusive: true,
    fn,
  });
}
