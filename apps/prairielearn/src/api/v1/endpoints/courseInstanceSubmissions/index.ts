import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';

import {
  AssessmentInstanceSchema,
  AssessmentQuestionSchema,
  AssessmentSchema,
  InstanceQuestionSchema,
  QuestionSchema,
  RubricGradingItemSchema,
  RubricGradingSchema,
  SprocGroupInfoSchema,
  SubmissionSchema,
  TagSchema,
  TopicSchema,
  UserSchema,
  VariantSchema,
} from '../../../../lib/db-types.js';

const sql = sqldb.loadSql(path.join(import.meta.dirname, '..', 'queries.sql'));
const router = Router({ mergeParams: true });

const SubmissionDataSchema = z.array(
  z.object({
    submission_id: SubmissionSchema.shape.id,
    user_id: UserSchema.shape.user_id,
    user_uid: UserSchema.shape.uid,
    user_uin: UserSchema.shape.uin,
    user_name: UserSchema.shape.name,
    user_role: z.string(),
    group_id: SprocGroupInfoSchema.shape.id,
    group_name: SprocGroupInfoSchema.shape.name,
    group_uids: SprocGroupInfoSchema.shape.uid_list,
    assessment_id: AssessmentSchema.shape.id,
    assessment_name: AssessmentSchema.shape.tid,
    assessment_label: z.string(),
    assessment_instance_id: AssessmentInstanceSchema.shape.id,
    assessment_instance_number: AssessmentInstanceSchema.shape.number,
    question_id: QuestionSchema.shape.id,
    question_name: QuestionSchema.shape.qid,
    question_topic: TopicSchema.shape.name,
    question_tags: z.array(TagSchema.shape.name),
    instance_question_id: InstanceQuestionSchema.shape.id,
    instance_question_number: InstanceQuestionSchema.shape.number,
    assessment_question_max_points: AssessmentQuestionSchema.shape.max_points,
    assessment_question_max_auto_points: AssessmentQuestionSchema.shape.max_auto_points,
    assessment_question_max_manual_points: AssessmentQuestionSchema.shape.max_manual_points,
    instance_question_points: InstanceQuestionSchema.shape.points,
    instance_question_auto_points: InstanceQuestionSchema.shape.auto_points,
    instance_question_manual_points: InstanceQuestionSchema.shape.manual_points,
    instance_question_score_perc: InstanceQuestionSchema.shape.score_perc,
    variant_id: VariantSchema.shape.id,
    variant_number: VariantSchema.shape.number,
    variant_seed: VariantSchema.shape.variant_seed,
    params: SubmissionSchema.shape.params,
    true_answer: SubmissionSchema.shape.true_answer,
    options: VariantSchema.shape.options,
    date: z.string(),
    submitted_answer: SubmissionSchema.shape.submitted_answer,
    partial_scores: SubmissionSchema.shape.partial_scores,
    override_score: SubmissionSchema.shape.override_score,
    credit: SubmissionSchema.shape.credit,
    mode: SubmissionSchema.shape.mode,
    grading_requested_at: z.string(),
    graded_at: z.string(),
    score: SubmissionSchema.shape.score,
    correct: SubmissionSchema.shape.correct,
    feedback: SubmissionSchema.shape.feedback,
    rubric_grading_computed_points: RubricGradingSchema.shape.computed_points,
    rubric_grading_adjust_points: RubricGradingSchema.shape.adjust_points,
    rubric_grading_items: z
      .array(
        z.object({
          rubric_item_id: RubricGradingItemSchema.shape.rubric_item_id,
          text: RubricGradingItemSchema.shape.description,
          points: RubricGradingItemSchema.shape.points,
        }),
      )
      .nullable(),
    final_submission_per_variant: z.boolean(),
    best_submission_per_variant: z.boolean(),
  }),
);

router.get(
  '/:unsafe_submission_id',
  asyncHandler(async (req, res) => {
    const data = await sqldb.queryRow(
      sql.select_submissions,
      {
        course_instance_id: res.locals.course_instance.id,
        unsafe_assessment_instance_id: null,
        unsafe_submission_id: req.params.unsafe_submission_id,
      },
      SubmissionDataSchema,
    );
    if (data.length === 0) {
      res.status(404).send({
        message: 'Not Found',
      });
    } else {
      res.status(200).send(data[0]);
    }
  }),
);

export default router;
