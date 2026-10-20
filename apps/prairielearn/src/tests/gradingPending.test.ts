import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { z } from 'zod';

import { loadSqlEquiv, queryRows, queryScalar } from '@prairielearn/postgres';

import {
  gradeAssessmentInstance,
  makeAssessmentInstance,
  setAssessmentInstanceScore,
} from '../lib/assessment.js';
import { config } from '../lib/config.js';
import {
  AssessmentQuestionSchema,
  InstanceQuestionSchema,
  QuestionSchema,
} from '../lib/db-types.js';
import { saveSubmission } from '../lib/grading.js';
import {
  updateAssessmentQuestionRubric,
  updateInstanceQuestionScore,
} from '../lib/manualGrading.js';
import { ensureVariant } from '../lib/question-variant.js';
import { selectAssessmentInstanceById } from '../models/assessment-instance.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
import { insertGradingJob, updateGradingJobAfterGrading } from '../models/grading-job.js';
import { selectUserByUid } from '../models/user.js';
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
    async save(qid: string) {
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
          user_id: user.id,
          auth_user_id: user.id,
          submitted_answer: Object.fromEntries(
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

  test('manual saves, grading, and review tagging maintain the cache independently of scores', async () => {
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
      expect((await selectAssessmentInstanceById(fixture.id)).grading_pending).toBe(false);
      const saved = await fixture.save('internalGrade/addingNumbers2');
      expect((await selectAssessmentInstanceById(fixture.id)).grading_pending).toBe(true);
      await updateInstanceQuestionScore({
        assessment: fixture.assessment,
        instance_question_id: saved.instance_question.id,
        submission_id: saved.submission_id,
        check_modified_at: null,
        score: { manual_points: 1 },
        authn_user_id: fixture.user.id,
      });
      expect((await selectAssessmentInstanceById(fixture.id)).grading_pending).toBe(false);

      await setAssessmentInstanceScore(fixture.id, 75, fixture.user.id);
      const { grading_pending: _pending, ...before } = await selectAssessmentInstanceById(
        fixture.id,
      );
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
      const { grading_pending, ...after } = await selectAssessmentInstanceById(fixture.id);
      expect(grading_pending).toBe(true);
      expect(after).toEqual(before);
      expect(
        await queryScalar(sql.count_score_logs, { assessment_instance_id: fixture.id }, z.number()),
      ).toBe(logCount);
      await tag(saved, false);
      expect((await selectAssessmentInstanceById(fixture.id)).grading_pending).toBe(false);
    });
  });

  test('automatic jobs clear pending after successful or invalid grading; saving alone does not imply grading', async () => {
    await runInTransactionAndRollback(async () => {
      const fixture = await createFixture();
      for (const gradable of [false, true]) {
        const saved = await fixture.save('internalGrade/addingNumbers');
        expect((await selectAssessmentInstanceById(fixture.id)).grading_pending).toBe(false);
        const job = await insertGradingJob({
          submission_id: saved.submission_id,
          authn_user_id: fixture.user.id,
        });
        expect((await selectAssessmentInstanceById(fixture.id)).grading_pending).toBe(true);
        await updateGradingJobAfterGrading({
          grading_job_id: job.id,
          gradable,
          broken: false,
          score: gradable ? 1 : null,
        });
        expect((await selectAssessmentInstanceById(fixture.id)).grading_pending).toBe(false);
      }
    });
  });

  test('deferred automatic grading stays pending after manual grading, and clears when the exam is finished', async () => {
    await runInTransactionAndRollback(async () => {
      const fixture = await createFixture('exam17-mixedRealTimeGrading');
      const saved = await fixture.save('addNumbers');
      expect((await selectAssessmentInstanceById(fixture.id)).grading_pending).toBe(true);
      await updateInstanceQuestionScore({
        assessment: fixture.assessment,
        instance_question_id: saved.instance_question.id,
        submission_id: saved.submission_id,
        check_modified_at: null,
        score: { manual_points: 1 },
        authn_user_id: fixture.user.id,
      });
      expect((await selectAssessmentInstanceById(fixture.id)).grading_pending).toBe(true);
      await gradeAssessmentInstance({
        assessment_instance_id: fixture.id,
        user_id: fixture.user.id,
        authn_user_id: fixture.user.id,
        requireOpen: true,
        close: true,
        ignoreGradeRateLimit: true,
        ignoreRealTimeGradingDisabled: true,
        client_fingerprint_id: null,
      });
      expect(await selectAssessmentInstanceById(fixture.id)).toMatchObject({
        open: false,
        grading_pending: false,
      });
    });
  });
});
