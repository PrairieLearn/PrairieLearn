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
 * uid of the dev administrator user (created by `insertDevUser`), used as the
 * acting/grader user for rubric creation and grading.
 *
 * Seed students themselves are generated with realistic fake names/emails via
 * `generateUser`; the seed is kept idempotent by the top-level
 * `selectAssessmentHasInstances` gate rather than by deterministic uids.
 */
export const DEV_USER_UID = 'dev@example.com';
