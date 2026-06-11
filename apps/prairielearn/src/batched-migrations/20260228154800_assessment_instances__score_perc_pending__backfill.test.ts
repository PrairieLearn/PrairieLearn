import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import * as helperDb from '../tests/helperDb.js';

import migration from './20260228154800_assessment_instances__score_perc_pending__backfill.js';

const MIGRATION_NAME = '20260228154800_assessment_instances__score_perc_pending__backfill';
const sql = sqldb.loadSqlEquiv(import.meta.url);

describe('assessment_instances score_perc_pending backfill migration', { timeout: 60_000 }, () => {
  it('backfills pending score and is idempotent', async () => {
    await helperDb.testMigration({
      name: MIGRATION_NAME,
      beforeMigration: async () => {
        const courseId = await sqldb.queryScalar(
          sql.insert_course,
          {
            path: 'score-pending-backfill',
            short_name: 'SPB',
            title: 'Score pending backfill',
          },
          IdSchema,
        );

        const courseInstanceId = await sqldb.queryScalar(
          sql.insert_course_instance,
          {
            course_id: courseId,
            short_name: 'SPB CI',
            long_name: 'Score Pending Backfill CI',
            enrollment_code: 'spb-code',
          },
          IdSchema,
        );

        const assessmentId = await sqldb.queryScalar(
          sql.insert_assessment,
          {
            course_instance_id: courseInstanceId,
            title: 'Backfill test assessment',
            type: 'Homework',
          },
          IdSchema,
        );

        const examAssessmentId = await sqldb.queryScalar(
          sql.insert_assessment,
          {
            course_instance_id: courseInstanceId,
            title: 'Backfill exam assessment',
            type: 'Exam',
          },
          IdSchema,
        );

        const zoneId = await sqldb.queryScalar(
          sql.insert_zone,
          { assessment_id: assessmentId, number: 1, title: 'Zone 1' },
          IdSchema,
        );

        const alternativeGroupId = await sqldb.queryScalar(
          sql.insert_alternative_group,
          { assessment_id: assessmentId, zone_id: zoneId, number: 1 },
          IdSchema,
        );

        const examZoneId = await sqldb.queryScalar(
          sql.insert_zone,
          { assessment_id: examAssessmentId, number: 1, title: 'Exam zone' },
          IdSchema,
        );

        const examAlternativeGroupId = await sqldb.queryScalar(
          sql.insert_alternative_group,
          { assessment_id: examAssessmentId, zone_id: examZoneId, number: 1 },
          IdSchema,
        );

        const questionId = await sqldb.queryScalar(
          sql.insert_question,
          { course_id: courseId, qid: 'spb-q1', title: 'Backfill question' },
          IdSchema,
        );

        const autoQuestionId = await sqldb.queryScalar(
          sql.insert_question,
          { course_id: courseId, qid: 'spb-q2', title: 'Backfill auto question' },
          IdSchema,
        );

        const examQuestionId = await sqldb.queryScalar(
          sql.insert_question,
          { course_id: courseId, qid: 'spb-q3', title: 'Backfill exam question' },
          IdSchema,
        );

        const assessmentQuestionId = await sqldb.queryScalar(
          sql.insert_assessment_question,
          {
            assessment_id: assessmentId,
            question_id: questionId,
            alternative_group_id: alternativeGroupId,
            max_points: 50,
            max_manual_points: 20,
            max_auto_points: 30,
          },
          IdSchema,
        );

        const autoAssessmentQuestionId = await sqldb.queryScalar(
          sql.insert_assessment_question,
          {
            assessment_id: assessmentId,
            question_id: autoQuestionId,
            alternative_group_id: alternativeGroupId,
            max_points: 30,
            max_manual_points: 0,
            max_auto_points: 30,
          },
          IdSchema,
        );

        const examAssessmentQuestionId = await sqldb.queryScalar(
          sql.insert_assessment_question,
          {
            assessment_id: examAssessmentId,
            question_id: examQuestionId,
            alternative_group_id: examAlternativeGroupId,
            max_points: 10,
            max_manual_points: 0,
            max_auto_points: 10,
          },
          IdSchema,
        );

        const userId = await sqldb.queryScalar(
          sql.insert_user,
          { uid: 'spb-user', name: 'Score Pending Backfill User' },
          IdSchema,
        );

        const assessmentInstanceId = await sqldb.queryScalar(
          sql.insert_assessment_instance,
          { assessment_id: assessmentId, user_id: userId, number: 1, max_points: 80 },
          IdSchema,
        );

        const zeroMaxAssessmentInstanceId = await sqldb.queryScalar(
          sql.insert_assessment_instance,
          { assessment_id: assessmentId, user_id: userId, number: 2, max_points: 0 },
          IdSchema,
        );

        const examAssessmentInstanceId = await sqldb.queryScalar(
          sql.insert_assessment_instance,
          { assessment_id: examAssessmentId, user_id: userId, number: 1, max_points: 10 },
          IdSchema,
        );

        await sqldb.execute(sql.insert_manual_instance_questions, {
          assessment_instance_id: assessmentInstanceId,
          zero_max_assessment_instance_id: zeroMaxAssessmentInstanceId,
          assessment_question_id: assessmentQuestionId,
        });

        await sqldb.execute(sql.insert_auto_instance_questions, {
          assessment_instance_id: assessmentInstanceId,
          zero_max_assessment_instance_id: zeroMaxAssessmentInstanceId,
          assessment_question_id: autoAssessmentQuestionId,
        });

        await sqldb.execute(sql.insert_exam_auto_instance_question, {
          assessment_instance_id: examAssessmentInstanceId,
          assessment_question_id: examAssessmentQuestionId,
        });

        return { assessmentInstanceId, zeroMaxAssessmentInstanceId, examAssessmentInstanceId };
      },
      afterMigration: async ({
        assessmentInstanceId,
        zeroMaxAssessmentInstanceId,
        examAssessmentInstanceId,
      }) => {
        const instanceIds = [
          assessmentInstanceId,
          zeroMaxAssessmentInstanceId,
          examAssessmentInstanceId,
        ];
        const start = instanceIds.reduce((min, id) => (id < min ? id : min));
        const end = instanceIds.reduce((max, id) => (id > max ? id : max));

        await migration.execute(start, end);

        const firstAssessmentInstancePending = await sqldb.queryScalar(
          sql.select_score_perc_pending,
          { id: assessmentInstanceId },
          z.number(),
        );
        const zeroMaxAssessmentInstancePending = await sqldb.queryScalar(
          sql.select_score_perc_pending,
          { id: zeroMaxAssessmentInstanceId },
          z.number(),
        );
        const examAssessmentInstancePending = await sqldb.queryScalar(
          sql.select_score_perc_pending,
          { id: examAssessmentInstanceId },
          z.number(),
        );

        expect(firstAssessmentInstancePending).toBeCloseTo(56.25, 4);
        expect(zeroMaxAssessmentInstancePending).toBe(0);
        expect(examAssessmentInstancePending).toBeCloseTo(60, 4);

        await migration.execute(start, end);

        const secondAssessmentInstancePending = await sqldb.queryScalar(
          sql.select_score_perc_pending,
          { id: assessmentInstanceId },
          z.number(),
        );
        const secondZeroMaxAssessmentInstancePending = await sqldb.queryScalar(
          sql.select_score_perc_pending,
          { id: zeroMaxAssessmentInstanceId },
          z.number(),
        );
        const secondExamAssessmentInstancePending = await sqldb.queryScalar(
          sql.select_score_perc_pending,
          { id: examAssessmentInstanceId },
          z.number(),
        );

        expect(secondAssessmentInstancePending).toBeCloseTo(56.25, 4);
        expect(secondZeroMaxAssessmentInstancePending).toBe(0);
        expect(secondExamAssessmentInstancePending).toBeCloseTo(60, 4);
      },
    });
  });
});
