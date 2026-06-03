import { logger } from '@prairielearn/logger';

import { selectAssessmentHasInstances } from '../../models/assessment-instance.js';
import { selectAssessmentByTid } from '../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../models/course-instances.js';
import { selectOptionalCourseByPath } from '../../models/course.js';
import { ensureUncheckedEnrollment } from '../../models/enrollment.js';
import { selectOpenInstanceQuestionsForAssessment } from '../../models/instance-question.js';
import { selectCompleteRubric } from '../../models/rubrics.js';
import { generateUser, selectOrInsertUserByUid } from '../../models/user.js';
import { syncOrCreateDiskToSql } from '../../sync/syncFromDisk.js';
import { selectAssessmentQuestions } from '../assessment-question.js';
import { makeAssessmentInstance } from '../assessment.js';
import { dangerousFullSystemAuthz } from '../authz-data-lib.js';
import { type CourseInstance } from '../db-types.js';
import { updateAssessmentQuestionRubric, updateInstanceQuestionScore } from '../manualGrading.js';
import { TEST_COURSE_PATH } from '../paths.js';
import { generateAndSaveTestSubmission } from '../question-testing.js';

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
 * An assessment question selected for seeding, classified by how its submissions
 * are graded:
 *
 * - `manual` (`max_manual_points > 0`): gets a generated rubric and a fraction
 *   of its submissions graded; the rest stay in the manual-grading queue.
 * - `auto` (auto points, not externally graded): auto-graded inline when the
 *   submission is saved. This includes `Manual`-method questions that carry
 *   auto points, which the grading pipeline auto-grades like internal questions.
 *
 * Externally graded questions (which would dispatch a job to a Docker grader
 * that isn't running in dev) and zero-point questions are excluded entirely.
 */
interface SeedQuestion {
  assessmentQuestionId: string;
  qid: string;
  kind: 'manual' | 'auto';
  maxManualPoints: number;
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

  const seedQuestionsByAqId = new Map<string, SeedQuestion>();
  for (const aq of assessmentQuestions) {
    const maxManualPoints = aq.assessment_question.max_manual_points ?? 0;
    const maxAutoPoints = aq.assessment_question.max_auto_points ?? 0;
    const isManual = maxManualPoints > 0;
    // Not `=== 'Internal'`: a `Manual`-method question carrying auto points is
    // auto-graded internally by the grading pipeline, so it belongs here too.
    // Only externally graded questions can't be graded inline in dev.
    const isAuto = !isManual && aq.question.grading_method !== 'External' && maxAutoPoints > 0;
    if (!isManual && !isAuto) continue;
    seedQuestionsByAqId.set(aq.assessment_question.id, {
      assessmentQuestionId: aq.assessment_question.id,
      qid: aq.question.qid ?? aq.assessment_question.id,
      kind: isManual ? 'manual' : 'auto',
      maxManualPoints,
    });
  }

  const manualQuestions = [...seedQuestionsByAqId.values()].filter((sq) => sq.kind === 'manual');
  if (manualQuestions.length === 0) {
    logger.warn(
      `[seed-dev-data] No manually-graded question found on ${TARGET_ASSESSMENT_TID}; skipping`,
    );
    return { skipped: true, studentsSeeded: 0, graded: 0 };
  }

  logger.info(
    `[seed-dev-data] Seeding ${SEED_STUDENT_COUNT} students on ${TARGET_ASSESSMENT_TID} across ${seedQuestionsByAqId.size} questions`,
  );

  for (let i = 0; i < SEED_STUDENT_COUNT; i++) {
    await seedStudentInstance({ assessment, courseInstance });
  }

  // Generate a submission for every open instance question across the
  // just-created assessment instances, auto-grading the auto questions inline.
  // Track each manual question's submissions so a fraction can be graded once
  // its rubric is attached.
  const manualSubmissionsByAqId = new Map<
    string,
    { instanceQuestionId: string; submissionId: string }[]
  >();
  for (const mq of manualQuestions) manualSubmissionsByAqId.set(mq.assessmentQuestionId, []);

  const instanceQuestions = await selectOpenInstanceQuestionsForAssessment(assessment.id);
  for (const row of instanceQuestions) {
    const seedQuestion = seedQuestionsByAqId.get(row.instance_question.assessment_question_id);
    if (seedQuestion == null) continue;

    const { submission_id } = await generateAndSaveTestSubmission({
      question: row.question,
      questionCourse: row.question_course,
      courseInstance,
      variantCourse: course,
      instanceQuestionId: row.instance_question.id,
      userId: row.user.id,
      testType: 'correct',
      grade: seedQuestion.kind === 'auto',
    });

    if (seedQuestion.kind === 'manual' && submission_id != null) {
      manualSubmissionsByAqId.get(seedQuestion.assessmentQuestionId)?.push({
        instanceQuestionId: row.instance_question.id,
        submissionId: submission_id,
      });
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
      logger.error(`[seed-dev-data] Rubric was not created for ${mq.qid}; skipping grading`);
      continue;
    }

    const submissions = manualSubmissionsByAqId.get(mq.assessmentQuestionId) ?? [];
    for (const { instanceQuestionId, submissionId } of submissions) {
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
 * opens an assessment instance (which populates its instance questions).
 */
async function seedStudentInstance({
  assessment,
  courseInstance,
}: {
  assessment: Awaited<ReturnType<typeof selectAssessmentByTid>>;
  courseInstance: CourseInstance;
}): Promise<void> {
  const student = await generateUser();
  await ensureUncheckedEnrollment({
    courseInstance,
    userId: student.id,
    requiredRole: ['System'],
    authzData: dangerousFullSystemAuthz(),
    actionDetail: 'implicit_joined',
  });

  await makeAssessmentInstance({
    assessment,
    user_id: student.id,
    authn_user_id: student.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
}
