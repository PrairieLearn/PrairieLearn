import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRows, queryScalar } from '@prairielearn/postgres';

import { deleteAiGradingJobs } from '../ee/lib/ai-grading/ai-grading-util.js';
import { makeAssessmentInstance, setAssessmentInstanceScore } from '../lib/assessment.js';
import { config } from '../lib/config.js';
import {
  AssessmentQuestionSchema,
  InstanceQuestionSchema,
  QuestionSchema,
} from '../lib/db-types.js';
import { saveSubmission } from '../lib/grading.js';
import {
  type InstanceQuestionScoreInput,
  updateAssessmentQuestionRubric,
  updateInstanceQuestionScore,
} from '../lib/manualGrading.js';
import { ensureVariant } from '../lib/question-variant.js';
import {
  clearAssessmentInstancesGradingPending,
  selectAssessmentInstanceById,
  selectGradingPendingAssessmentInstanceIds,
} from '../models/assessment-instance.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
import { insertGradingJob, updateGradingJobAfterGrading } from '../models/grading-job.js';
import { selectUserByUid } from '../models/user.js';
import { resetVariantsForInstanceQuestion } from '../models/variant.js';
import { updateInstanceQuestions } from '../pages/instructorAssessmentManualGrading/assessmentQuestion/queries.js';

import { runInTransactionAndRollback } from './helperDb.js';
import * as helperServer from './helperServer.js';

const sql = loadSqlEquiv(import.meta.url);

async function createFixture(tid = 'hw9-internalExternalManual') {
  const assessment = await selectAssessmentByTid({ course_instance_id: '1', tid });
  const user = await selectUserByUid(config.authUid!);
  const courseInstance = await selectCourseInstanceById('1');
  const course = await selectCourseById(courseInstance.course_id);
  const id = await makeAssessmentInstance({
    assessment,
    user_id: user.id,
    authn_user_id: user.id,
    mode: 'Public',
    time_limit_min: null,
    date: new Date(),
    client_fingerprint_id: null,
  });
  const questions = await queryRows(
    sql.select_questions,
    { assessment_instance_id: id },
    z.object({
      instance_question: InstanceQuestionSchema,
      assessment_question: AssessmentQuestionSchema,
      question: QuestionSchema,
    }),
  );
  return {
    id,
    assessment,
    user,
    questions,
    async pending() {
      return (await selectGradingPendingAssessmentInstanceIds([id])).includes(id);
    },
    async grade(
      saved: { instance_question: { id: string }; submission_id: string | null },
      score: InstanceQuestionScoreInput,
      is_ai_graded = false,
    ) {
      return await updateInstanceQuestionScore({
        assessment,
        instance_question_id: saved.instance_question.id,
        submission_id: saved.submission_id,
        check_modified_at: null,
        score,
        authn_user_id: user.id,
        is_ai_graded,
      });
    },
    async save(qid: string, credit = 100, submittedAnswer?: Record<string, string>) {
      const row = questions.find((row) => row.question.qid === qid)!;
      const variant = await ensureVariant({
        question_id: row.question.id,
        instance_question_id: row.instance_question.id,
        user_id: user.id,
        authn_user_id: user.id,
        course_instance: courseInstance,
        variant_course: course,
        question_course: course,
        options: {},
        require_open: true,
        client_fingerprint_id: null,
      });
      const result = await saveSubmission(
        {
          variant_id: variant.id,
          credit,
          user_id: user.id,
          auth_user_id: user.id,
          submitted_answer:
            submittedAnswer ??
            Object.fromEntries(
              Object.entries(variant.true_answer ?? {}).map(([key, value]) => [key, String(value)]),
            ),
        },
        variant,
        row.question,
        course,
      );
      return { ...row, ...result };
    },
  };
}

describe('Assessment grading status', { timeout: 60_000 }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  test('review tagging does not reactivate pending, and marking graded acknowledges saved work', async () => {
    await runInTransactionAndRollback(async () => {
      const fixture = await createFixture();
      const unanswered = fixture.questions.find(
        (row) => row.question.qid === 'manualGrade/codeUpload',
      )!;
      const tag = async (row: typeof unanswered, value: boolean) =>
        updateInstanceQuestions({
          assessment_question: row.assessment_question,
          instance_question_ids: [row.instance_question.id],
          update_requires_manual_grading: true,
          requires_manual_grading: value,
          update_assigned_grader: false,
          assigned_grader: null,
        });
      await tag(unanswered, true);
      expect(await fixture.pending()).toBe(false);
      const saved = await fixture.save('internalGrade/addingNumbers2');
      expect(await fixture.pending()).toBe(true);
      await fixture.grade(saved, { manual_points: 1 });
      expect(await fixture.pending()).toBe(false);

      await setAssessmentInstanceScore(fixture.id, 75, fixture.user.id);
      const before = await selectAssessmentInstanceById(fixture.id);
      const logCount = await queryScalar(
        sql.count_score_logs,
        { assessment_instance_id: fixture.id },
        z.number(),
      );
      await updateAssessmentQuestionRubric({
        assessment: fixture.assessment,
        assessment_question_id: saved.assessment_question.id,
        use_rubric: false,
        replace_auto_points: false,
        starting_points: 0,
        min_points: 0,
        max_extra_points: 0,
        rubric_items: [],
        tag_for_manual_grading: true,
        grader_guidelines: null,
        authn_user_id: fixture.user.id,
      });
      const after = await selectAssessmentInstanceById(fixture.id);
      expect(await fixture.pending()).toBe(false);
      expect(after).toEqual(before);
      expect(
        await queryScalar(sql.count_score_logs, { assessment_instance_id: fixture.id }, z.number()),
      ).toBe(logCount);
      await fixture.save('internalGrade/addingNumbers2');
      expect(await fixture.pending()).toBe(true);
      await tag(saved, false);
      expect(await fixture.pending()).toBe(false);
    });
  });

  test('saved automatic answers stay pending until successful or invalid grading completes', async () => {
    await runInTransactionAndRollback(async () => {
      const fixture = await createFixture();
      for (const gradable of [false, true]) {
        const saved = await fixture.save('internalGrade/addingNumbers');
        expect(await fixture.pending()).toBe(true);
        const job = await insertGradingJob({
          submission_id: saved.submission_id,
          authn_user_id: fixture.user.id,
        });
        expect(await fixture.pending()).toBe(true);
        await updateGradingJobAfterGrading({
          grading_job_id: job.id,
          gradable,
          broken: false,
          score: gradable ? 1 : null,
        });
        expect(await fixture.pending()).toBe(false);
      }
    });
  });

  test('an invalid automatic save replaces older work without allowing a stale result to acknowledge new work', async () => {
    await runInTransactionAndRollback(async () => {
      const fixture = await createFixture();
      const old = await fixture.save('internalGrade/addingNumbers');
      const delayed = await insertGradingJob({
        submission_id: old.submission_id,
        authn_user_id: fixture.user.id,
      });
      await fixture.save('internalGrade/addingNumbers', 100, { c: 'not a number' });
      expect(await fixture.pending()).toBe(false);

      const current = await fixture.save('internalGrade/addingNumbers');
      await updateGradingJobAfterGrading({
        grading_job_id: delayed.id,
        gradable: true,
        broken: false,
        score: 0.5,
      });
      expect(await fixture.pending()).toBe(true);
      const job = await insertGradingJob({
        submission_id: current.submission_id,
        authn_user_id: fixture.user.id,
      });
      await updateGradingJobAfterGrading({
        grading_job_id: job.id,
        gradable: true,
        broken: false,
        score: 0.5,
      });
      expect(await fixture.pending()).toBe(false);
    });
  });

  test('automatic grading finishes pending work even when the question has been closed', async () => {
    await runInTransactionAndRollback(async () => {
      const fixture = await createFixture();
      const saved = await fixture.save('internalGrade/addingNumbers');
      const job = await insertGradingJob({
        submission_id: saved.submission_id,
        authn_user_id: fixture.user.id,
      });
      await execute(sql.close_instance_question, {
        instance_question_id: saved.instance_question.id,
      });
      await updateGradingJobAfterGrading({
        grading_job_id: job.id,
        gradable: true,
        broken: false,
        score: 0.5,
      });
      expect(await fixture.pending()).toBe(false);
    });
  });

  test('clearing acknowledges old work, and grading new work does not revive it', async () => {
    await runInTransactionAndRollback(async () => {
      const fixture = await createFixture();
      const manual = await fixture.save('internalGrade/addingNumbers2');
      await setAssessmentInstanceScore(fixture.id, 75, fixture.user.id);
      expect(await fixture.pending()).toBe(false);
      expect(
        await queryScalar(
          sql.requires_manual_grading,
          { instance_question_id: manual.instance_question.id },
          z.boolean(),
        ),
      ).toBe(true);

      const automatic = await fixture.save('internalGrade/addingNumbers');
      expect(await fixture.pending()).toBe(true);
      const job = await insertGradingJob({
        submission_id: automatic.submission_id,
        authn_user_id: fixture.user.id,
      });
      await updateGradingJobAfterGrading({
        grading_job_id: job.id,
        gradable: true,
        broken: false,
        score: 0.5,
      });
      expect(await fixture.pending()).toBe(false);

      const current = await fixture.save('internalGrade/addingNumbers2');
      const delayed = await insertGradingJob({
        submission_id: current.submission_id,
        authn_user_id: fixture.user.id,
      });
      const before = await selectAssessmentInstanceById(fixture.id);
      await clearAssessmentInstancesGradingPending({
        assessment_id: fixture.assessment.id,
        assessment_instance_ids: [fixture.id],
      });
      const after = await selectAssessmentInstanceById(fixture.id);
      expect(await fixture.pending()).toBe(false);
      expect(after).toEqual(before);
      await updateGradingJobAfterGrading({
        grading_job_id: delayed.id,
        gradable: true,
        broken: false,
        score: 0.5,
      });
      expect(await fixture.pending()).toBe(false);
    });
  });

  test('mixed grading preserves pending after auto grading and acknowledges the question after manual grading', async () => {
    await runInTransactionAndRollback(async () => {
      const fixture = await createFixture();
      const saved = await fixture.save('internalGrade/addingNumbers2');
      const job = await insertGradingJob({
        submission_id: saved.submission_id,
        authn_user_id: fixture.user.id,
      });
      await updateGradingJobAfterGrading({
        grading_job_id: job.id,
        gradable: true,
        broken: false,
        score: 0.5,
      });
      expect(await fixture.pending()).toBe(true);
      await fixture.grade(saved, { manual_points: 1 });
      expect(await fixture.pending()).toBe(false);
    });
  });

  test('full question points and zero-credit saves do not activate pending or dismiss earlier work', async () => {
    await runInTransactionAndRollback(async () => {
      const fixture = await createFixture();
      const saved = await fixture.save('internalGrade/addingNumbers2');
      await fixture.save('internalGrade/addingNumbers2', 0);
      expect(await fixture.pending()).toBe(true);
      await fixture.save('internalGrade/addingNumbers2', 100, { c: 'not a number' });
      expect(await fixture.pending()).toBe(true);
      await fixture.grade({ ...saved, submission_id: null }, { score_perc: 100 });
      await fixture.save('internalGrade/addingNumbers2');
      expect(await fixture.pending()).toBe(false);
      await fixture.save('internalGrade/addingNumbers', 0);
      expect(await fixture.pending()).toBe(false);
    });
  });

  test('an old AI result cannot acknowledge a newer mixed submission', async () => {
    await runInTransactionAndRollback(async () => {
      const fixture = await createFixture();
      const old = await fixture.save('internalGrade/addingNumbers2');
      const current = await fixture.save('internalGrade/addingNumbers2');
      await fixture.grade(old, { manual_points: 0.5 }, true);
      expect(await fixture.pending()).toBe(true);
      const job = await insertGradingJob({
        submission_id: current.submission_id,
        authn_user_id: fixture.user.id,
      });
      await updateGradingJobAfterGrading({
        grading_job_id: job.id,
        gradable: true,
        broken: false,
        score: 0.5,
      });
      expect(await fixture.pending()).toBe(true);
      await clearAssessmentInstancesGradingPending({
        assessment_id: fixture.assessment.id,
        assessment_instance_ids: [fixture.id],
      });
      expect(await fixture.pending()).toBe(false);
    });
  });
  test('deleting AI grades preserves newer saved work when an older manual grade is restored', async () => {
    await runInTransactionAndRollback(async () => {
      const fixture = await createFixture();
      const manual = await fixture.save('internalGrade/addingNumbers2');
      await fixture.grade(manual, { manual_points: 0.5 });
      const ai = await fixture.save('internalGrade/addingNumbers2');
      await fixture.grade(ai, { manual_points: 0.75 }, true);
      const current = await fixture.save('internalGrade/addingNumbers2');
      await deleteAiGradingJobs({
        assessment_question_ids: [current.assessment_question.id],
        authn_user_id: fixture.user.id,
      });
      expect(await fixture.pending()).toBe(true);
      const job = await insertGradingJob({
        submission_id: current.submission_id,
        authn_user_id: fixture.user.id,
      });
      await updateGradingJobAfterGrading({
        grading_job_id: job.id,
        gradable: true,
        broken: false,
        score: 0.5,
      });
      expect(await fixture.pending()).toBe(true);
    });
  });

  test('resetting a variant discards automatic work while preserving its pending manual work', async () => {
    await runInTransactionAndRollback(async () => {
      const fixture = await createFixture();
      const automatic = await fixture.save('internalGrade/addingNumbers');
      await resetVariantsForInstanceQuestion({
        assessment_instance_id: fixture.id,
        unsafe_instance_question_id: automatic.instance_question.id,
        authn_user_id: fixture.user.id,
      });
      expect(await fixture.pending()).toBe(false);
      const mixed = await fixture.save('internalGrade/addingNumbers2');
      await resetVariantsForInstanceQuestion({
        assessment_instance_id: fixture.id,
        unsafe_instance_question_id: mixed.instance_question.id,
        authn_user_id: fixture.user.id,
      });
      expect(await fixture.pending()).toBe(true);
    });
  });

  test.each([
    ['Homework', 'hw9-internalExternalManual', 'internalGrade/addingNumbers'],
    ['Exam', 'exam17-mixedRealTimeGrading', 'addNumbers'],
  ])(
    '%s question removal and restoration affect visibility without rewriting pending state',
    async (type, tid, qid) => {
      await runInTransactionAndRollback(async () => {
        const fixture = await createFixture(tid);
        const saved = await fixture.save(qid);
        await execute(sql.set_question_retention, {
          assessment_question_id: saved.assessment_question.id,
          deleted: true,
          alternative_group_id: saved.assessment_question.alternative_group_id,
        });
        expect(await fixture.pending()).toBe(type === 'Exam');
        if (type === 'Exam') {
          await execute(sql.set_question_retention, {
            assessment_question_id: saved.assessment_question.id,
            deleted: true,
            alternative_group_id: null,
          });
        }
        expect(await fixture.pending()).toBe(false);
        await execute(sql.set_question_retention, {
          assessment_question_id: saved.assessment_question.id,
          deleted: false,
          alternative_group_id: saved.assessment_question.alternative_group_id,
        });
        expect(await fixture.pending()).toBe(true);
        await clearAssessmentInstancesGradingPending({
          assessment_id: fixture.assessment.id,
          assessment_instance_ids: [fixture.id],
        });
        expect(await fixture.pending()).toBe(false);
      });
    },
  );
});
