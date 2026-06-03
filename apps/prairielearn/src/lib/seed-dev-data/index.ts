import { logger } from '@prairielearn/logger';

import { selectAssessmentHasInstances } from '../../models/assessment-instance.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectOptionalCourseByPath } from '../../models/course.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import { selectInstanceQuestionForAssessmentInstance } from '../../models/instance-question.js';
import { selectQuestionById } from '../../models/question.js';
import { selectCompleteRubric } from '../../models/rubrics.js';
import { generateUser, selectOrInsertUserByUid } from '../../models/user.js';
import { syncOrCreateDiskToSql } from '../../sync/syncFromDisk.js';
import { selectAssessmentQuestions } from '../assessment-question.js';
import { makeAssessmentInstance } from '../assessment.js';
import { dangerousFullSystemAuthz } from '../authz-data-lib.js';
import { type Course, type CourseInstance, type Question } from '../db-types.js';
import { saveAndGradeSubmission, saveSubmission } from '../grading.js';
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
} from './constants.js';
import { generateFakeRubric } from './rubric.js';

export interface SeedResult {
  /** True when seeding was skipped (already seeded, or no manual question). */
  skipped: boolean;
  /** Number of students for which submissions were created. */
  studentsSeeded: number;
  /** Number of manual submissions that were graded with a rubric. */
  graded: number;
}

/**
 * A question selected for seeding, classified by how its submissions are graded.
 *
 * - `isManual` questions (`max_manual_points > 0`) get a generated rubric and a
 *   fraction of their submissions graded; the rest stay in the manual-grading
 *   queue.
 * - `isAuto` questions (internally graded with auto points) are auto-graded
 *   inline when the submission is saved.
 *
 * Externally graded questions (which would dispatch a job to a Docker grader
 * that isn't running in dev) and zero-point questions are excluded entirely.
 */
interface SeedQuestion {
  assessmentQuestionId: string;
  maxManualPoints: number;
  question: Question;
  isManual: boolean;
  isAuto: boolean;
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

  const seedQuestions: SeedQuestion[] = [];
  for (const aq of assessmentQuestions) {
    const maxManualPoints = aq.assessment_question.max_manual_points ?? 0;
    const maxAutoPoints = aq.assessment_question.max_auto_points ?? 0;
    const question = await selectQuestionById(aq.assessment_question.question_id);
    const isManual = maxManualPoints > 0;
    const isAuto = !isManual && question.grading_method === 'Internal' && maxAutoPoints > 0;
    if (!isManual && !isAuto) continue;
    seedQuestions.push({
      assessmentQuestionId: aq.assessment_question.id,
      maxManualPoints,
      question,
      isManual,
      isAuto,
    });
  }

  const manualQuestions = seedQuestions.filter((sq) => sq.isManual);
  if (manualQuestions.length === 0) {
    logger.warn(
      `[seed-dev-data] No manually-graded question found on ${TARGET_ASSESSMENT_TID}; skipping`,
    );
    return { skipped: true, studentsSeeded: 0, graded: 0 };
  }

  logger.info(
    `[seed-dev-data] Seeding ${SEED_STUDENT_COUNT} students on ${TARGET_ASSESSMENT_TID} across ${seedQuestions.length} questions`,
  );

  // Per manual question, track (instance question id -> submission id) so we can
  // grade a fraction of them once the rubric is attached.
  const manualSubmissionsByQuestion = new Map<string, Map<string, string>>();
  for (const mq of manualQuestions) {
    manualSubmissionsByQuestion.set(mq.assessmentQuestionId, new Map());
  }

  for (let i = 0; i < SEED_STUDENT_COUNT; i++) {
    const { student, assessmentInstanceId } = await seedStudentInstance({
      assessment,
      courseInstance,
    });

    for (const sq of seedQuestions) {
      const { instanceQuestionId, submissionId } = await seedQuestionSubmission({
        assessmentInstanceId,
        assessmentQuestionId: sq.assessmentQuestionId,
        course,
        courseInstance,
        question: sq.question,
        student,
        autoGrade: sq.isAuto,
      });
      if (sq.isManual) {
        manualSubmissionsByQuestion
          .get(sq.assessmentQuestionId)
          ?.set(instanceQuestionId, submissionId);
      }
    }
  }

  // Attach a generated rubric to each manual question and grade a fraction of
  // its submissions, leaving the rest pending in the manual-grading queue.
  // `tag_for_manual_grading` flags all existing instance questions as needing
  // manual grading.
  let gradedCount = 0;
  for (const mq of manualQuestions) {
    const rubricConfig = generateFakeRubric({
      numItems: 5,
      includeNegativeItem: true,
      replaceAutoPoints: false,
      maxPoints: mq.maxManualPoints,
    });
    await updateAssessmentQuestionRubric({
      assessment,
      assessment_question_id: mq.assessmentQuestionId,
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

    const { rubric, rubric_items: rubricItems } = await selectCompleteRubric(
      mq.assessmentQuestionId,
    );
    if (rubric == null) {
      logger.error(
        `[seed-dev-data] Rubric was not created for ${mq.question.qid}; skipping grading`,
      );
      continue;
    }

    const submissions = manualSubmissionsByQuestion.get(mq.assessmentQuestionId) ?? new Map();
    for (const [instanceQuestionId, submissionId] of submissions) {
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
  }

  logger.info(
    `[seed-dev-data] Seeded ${SEED_STUDENT_COUNT} students, graded ${gradedCount} manual submissions`,
  );

  return {
    skipped: false,
    studentsSeeded: SEED_STUDENT_COUNT,
    graded: gradedCount,
  };
}

/**
 * Generates one student with a realistic fake name/email, enrolls them, and
 * opens an assessment instance. Returns the student and the instance id.
 */
async function seedStudentInstance({
  assessment,
  courseInstance,
}: {
  assessment: Awaited<ReturnType<typeof selectAssessmentByTid>>;
  courseInstance: CourseInstance;
}): Promise<{ student: Awaited<ReturnType<typeof generateUser>>; assessmentInstanceId: string }> {
  const student = await generateUser();
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

  return { student, assessmentInstanceId };
}

/**
 * Saves a single submission on one question of a student's assessment instance.
 * When `autoGrade` is set (internally graded questions), the submission is also
 * graded inline; otherwise it is left ungraded for the manual-grading queue.
 * Returns the instance question and submission ids.
 */
async function seedQuestionSubmission({
  assessmentInstanceId,
  assessmentQuestionId,
  course,
  courseInstance,
  question,
  student,
  autoGrade,
}: {
  assessmentInstanceId: string;
  assessmentQuestionId: string;
  course: Course;
  courseInstance: CourseInstance;
  question: Question;
  student: Awaited<ReturnType<typeof generateUser>>;
  autoGrade: boolean;
}): Promise<{ instanceQuestionId: string; submissionId: string }> {
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

  const submissionData = {
    ...data,
    auth_user_id: student.id,
    user_id: student.id,
    variant_id: variant.id,
    submitted_answer: data.raw_submitted_answer,
    credit: 100,
  };

  if (autoGrade) {
    const submissionId = await saveAndGradeSubmission(
      submissionData,
      variant,
      question,
      course,
      true,
      true,
    );
    return { instanceQuestionId: instanceQuestion.id, submissionId };
  }

  const { submission_id } = await saveSubmission(submissionData, variant, question, course);
  return { instanceQuestionId: instanceQuestion.id, submissionId: submission_id };
}
