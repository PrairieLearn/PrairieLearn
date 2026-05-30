/** Number of synthetic students to enroll and generate submissions for. */
export const SEED_STUDENT_COUNT = 30;

/**
 * Fraction of generated submissions that are graded with the rubric (the rest
 * are left pending in the manual-grading queue).
 */
export const SEED_GRADED_FRACTION = 0.5;

/** Course instance (short name) in the test course to seed. */
export const TARGET_COURSE_INSTANCE_SHORT_NAME = 'Sp15';

/** Assessment (TID) in the test course to seed. */
export const TARGET_ASSESSMENT_TID = 'hw10-aiGrading';

/**
 * Prefix used to build deterministic seed-student uids, e.g.
 * `seed-student-001@example.com`. Deterministic uids make the seed idempotent
 * across restarts via `selectOrInsertUserByUid`.
 */
export const SEED_STUDENT_UID_PREFIX = 'seed-student-';

/**
 * uid of the dev administrator user (created by `insertDevUser`), used as the
 * acting/grader user for rubric creation and grading.
 */
export const DEV_USER_UID = 'dev@example.com';

/** Builds the deterministic uid for the i-th (1-based) seed student. */
export function seedStudentUid(index: number): string {
  return `${SEED_STUDENT_UID_PREFIX}${String(index).padStart(3, '0')}@example.com`;
}
