import { logger } from '@prairielearn/logger';

import { selectAssessmentHasInstances } from '../../models/assessment-instance.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectOptionalCourseByPath } from '../../models/course.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import { selectInstanceQuestionForAssessmentInstance } from '../../models/instance-question.js';
import { selectQuestionById } from '../../models/question.js';
import { selectCompleteRubric } from '../../models/rubrics.js';
import { selectOrInsertUserByUid } from '../../models/user.js';
import { syncOrCreateDiskToSql } from '../../sync/syncFromDisk.js';
import { selectAssessmentQuestions } from '../assessment-question.js';
import { makeAssessmentInstance } from '../assessment.js';
import { dangerousFullSystemAuthz } from '../authz-data-lib.js';
import { type Course, type CourseInstance, type Question } from '../db-types.js';
import { saveSubmission } from '../grading.js';
import { updateAssessmentQuestionRubric, updateInstanceQuestionScore } from '../manualGrading.js';
import { TEST_COURSE_PATH } from '../paths.js';
import { createTestSubmissionData } from '../question-testing.js';
import { ensureVariant } from '../question-variant.js';

import {
  DEV_USER_UID,
  SEED_GRADED_FRACTION,
  SEED_STUDENT_COUNT,
  TARGET_ASSESSMENT_TID,
  TARGET_COURSE_INSTANCE_SHORT_NAME,
  seedStudentUid,
} from './constants.js';
import { generateFakeRubric } from './rubric.js';

export interface SeedResult {
  /** True when seeding was skipped (already seeded, or no manual question). */
  skipped: boolean;
  /** Number of students for which a submission was created. */
  studentsSeeded: number;
  /** Number of submissions that were graded with the rubric. */
  graded: number;
}

/**
 * Seeds the test course with synthetic grading data (students, open assessment
 * instances, manual submissions, a generated rubric, and partial grading) so
 * that the manual-grading and assessment-instance-grading pages have realistic
 * data in dev. Idempotent: a no-op once the target assessment has any instance.
 *
 * Dev-only; the caller gates on `config.devMode` and swallows any error so that
 * a seeding failure never blocks server startup.
 */
export async function seedDevData(): Promise<SeedResult> {
  const devUser = await selectOrInsertUserByUid(DEV_USER_UID);

  let course = await selectOptionalCourseByPath(TEST_COURSE_PATH);
  if (course == null) {
    // First run on a fresh database: sync the test course from disk so the
    // course, course instance, assessment, and questions exist.
    logger.info('[seed-dev-data] Test course not found; syncing from disk');
    await syncOrCreateDiskToSql(TEST_COURSE_PATH, logger);
    course = await selectOptionalCourseByPath(TEST_COURSE_PATH);
    if (course == null) {
      logger.error('[seed-dev-data] Test course still missing after sync; skipping');
      return { skipped: true, studentsSeeded: 0, graded: 0 };
    }
  }

  const courseInstance = await selectCourseInstanceByShortName({
    course,
    shortName: TARGET_COURSE_INSTANCE_SHORT_NAME,
  });
  const assessment = await selectAssessmentByTid({
    course_instance_id: courseInstance.id,
    tid: TARGET_ASSESSMENT_TID,
  });

  if (await selectAssessmentHasInstances(assessment.id)) {
    logger.verbose('[seed-dev-data] Test course already seeded; skipping');
    return { skipped: true, studentsSeeded: 0, graded: 0 };
  }

  const assessmentQuestions = await selectAssessmentQuestions({ assessment_id: assessment.id });
  const manualQuestion = assessmentQuestions.find(
    (aq) => (aq.assessment_question.max_manual_points ?? 0) > 0,
  );
  if (manualQuestion == null) {
    logger.warn(
      `[seed-dev-data] No manually-graded question found on ${TARGET_ASSESSMENT_TID}; skipping`,
    );
    return { skipped: true, studentsSeeded: 0, graded: 0 };
  }

  const assessmentQuestionId = manualQuestion.assessment_question.id;
  const maxManualPoints = manualQuestion.assessment_question.max_manual_points ?? 0;
  const question = await selectQuestionById(manualQuestion.assessment_question.question_id);

  logger.info(`[seed-dev-data] Seeding ${SEED_STUDENT_COUNT} students on ${TARGET_ASSESSMENT_TID}`);

  const submissionsByInstanceQuestion = new Map<string, string>();
  for (let i = 1; i <= SEED_STUDENT_COUNT; i++) {
    const submission = await seedStudentSubmission({
      index: i,
      assessment,
      assessmentQuestionId,
      course,
      courseInstance,
      question,
    });
    submissionsByInstanceQuestion.set(submission.instanceQuestionId, submission.submissionId);
  }

  // Attach a generated rubric to the manual question. `tag_for_manual_grading`
  // flags all existing instance questions as needing manual grading.
  const rubricConfig = generateFakeRubric({
    numItems: 5,
    includeNegativeItem: true,
    replaceAutoPoints: false,
    maxPoints: maxManualPoints,
  });
  await updateAssessmentQuestionRubric({
    assessment,
    assessment_question_id: assessmentQuestionId,
    use_rubric: true,
    replace_auto_points: rubricConfig.replace_auto_points,
    starting_points: rubricConfig.starting_points,
    min_points: rubricConfig.min_points,
    max_extra_points: rubricConfig.max_extra_points,
    rubric_items: rubricConfig.rubric_items,
    tag_for_manual_grading: true,
    grader_guidelines: rubricConfig.grader_guidelines,
    authn_user_id: devUser.id,
  });

  // Grade a fraction of submissions with a random subset of rubric items,
  // leaving the rest pending in the manual-grading queue.
  const { rubric, rubric_items: rubricItems } = await selectCompleteRubric(assessmentQuestionId);
  if (rubric == null) {
    logger.error('[seed-dev-data] Rubric was not created; skipping grading');
    return { skipped: false, studentsSeeded: submissionsByInstanceQuestion.size, graded: 0 };
  }

  let gradedCount = 0;
  for (const [instanceQuestionId, submissionId] of submissionsByInstanceQuestion) {
    if (Math.random() >= SEED_GRADED_FRACTION) continue;

    const appliedRubricItems = rubricItems
      .filter(() => Math.random() < 0.5)
      .map((item) => ({ rubric_item_id: item.id }));

    await updateInstanceQuestionScore({
      assessment,
      instance_question_id: instanceQuestionId,
      submission_id: submissionId,
      check_modified_at: null,
      score: {
        manual_rubric_data: {
          rubric_id: rubric.id,
          applied_rubric_items: appliedRubricItems,
          adjust_points: 0,
        },
      },
      authn_user_id: devUser.id,
    });
    gradedCount++;
  }

  logger.info(
    `[seed-dev-data] Seeded ${submissionsByInstanceQuestion.size} submissions, graded ${gradedCount}`,
  );

  return {
    skipped: false,
    studentsSeeded: submissionsByInstanceQuestion.size,
    graded: gradedCount,
  };
}

/**
 * Creates one seed student, enrolls them, opens an assessment instance, and
 * saves a single (ungraded) submission on the manual question. Returns the
 * instance question and submission ids.
 */
async function seedStudentSubmission({
  index,
  assessment,
  assessmentQuestionId,
  course,
  courseInstance,
  question,
}: {
  index: number;
  assessment: Awaited<ReturnType<typeof selectAssessmentByTid>>;
  assessmentQuestionId: string;
  course: Course;
  courseInstance: CourseInstance;
  question: Question;
}): Promise<{ instanceQuestionId: string; submissionId: string }> {
  const student = await selectOrInsertUserByUid(seedStudentUid(index));
  await ensureUncheckedEnrollment({
    courseInstance,
    userId: student.id,
    requiredRole: ['System'],
    authzData: dangerousFullSystemAuthz(),
    actionDetail: 'implicit_joined',
  });

  const assessmentInstanceId = await makeAssessmentInstance({
    assessment,
    user_id: student.id,
    authn_user_id: student.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });

  const instanceQuestion = await selectInstanceQuestionForAssessmentInstance({
    assessment_instance_id: assessmentInstanceId,
    assessment_question_id: assessmentQuestionId,
  });

  const variant = await ensureVariant({
    question_id: question.id,
    instance_question_id: instanceQuestion.id,
    user_id: student.id,
    authn_user_id: student.id,
    course_instance: courseInstance,
    variant_course: course,
    question_course: course,
    options: { variant_seed: null },
    require_open: true,
    client_fingerprint_id: null,
  });

  const { data } = await createTestSubmissionData(
    variant,
    question,
    course,
    'correct',
    student.id,
    student.id,
  );

  const { submission_id } = await saveSubmission(
    {
      ...data,
      auth_user_id: student.id,
      user_id: student.id,
      variant_id: variant.id,
      submitted_answer: data.raw_submitted_answer,
      credit: 100,
    },
    variant,
    question,
    course,
  );

  return { instanceQuestionId: instanceQuestion.id, submissionId: submission_id };
}
