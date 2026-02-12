import * as path from 'node:path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import * as assessment from '../../../../lib/assessment.js';
import {
  AssessmentInstanceSchema,
  AssessmentQuestionSchema,
  AssessmentSchema,
  InstanceQuestionSchema,
  QuestionSchema,
  RubricGradingItemSchema,
  RubricGradingSchema,
  SprocTeamInfoSchema,
  SprocUsersGetDisplayedRoleSchema,
  SubmissionSchema,
  TagSchema,
  TopicSchema,
  UserSchema,
  VariantSchema,
  ZoneSchema,
} from '../../../../lib/db-types.js';
import { AssessmentInstanceDataSchema } from '../courseInstanceAssessments/index.js';

const sql = sqldb.loadSql(path.join(import.meta.dirname, '..', 'queries.sql'));
const router = Router({ mergeParams: true });

const InstanceQuestionDataSchema = z.object({
  zone_number: ZoneSchema.shape.number,
  zone_title: ZoneSchema.shape.title,
  question_id: QuestionSchema.shape.id,
  question_name: QuestionSchema.shape.qid,
  instance_question_id: InstanceQuestionSchema.shape.id,
  instance_question_number: InstanceQuestionSchema.shape.number,
  assessment_question_max_points: AssessmentQuestionSchema.shape.max_points,
  assessment_question_max_auto_points: AssessmentQuestionSchema.shape.max_auto_points,
  assessment_question_max_manual_points: AssessmentQuestionSchema.shape.max_manual_points,
  instance_question_points: InstanceQuestionSchema.shape.points,
  instance_question_auto_points: InstanceQuestionSchema.shape.auto_points,
  instance_question_manual_points: InstanceQuestionSchema.shape.manual_points,
  instance_question_score_perc: InstanceQuestionSchema.shape.score_perc,
  highest_submission_score: InstanceQuestionSchema.shape.highest_submission_score,
  last_submission_score: InstanceQuestionSchema.shape.last_submission_score,
  number_attempts: InstanceQuestionSchema.shape.number_attempts,
  duration_seconds: z.number(),
});

export const SubmissionDataSchema = z.object({
  submission_id: SubmissionSchema.shape.id,
  // left join users table
  user_id: UserSchema.shape.id.nullable(),
  user_uid: UserSchema.shape.uid.nullable(),
  user_uin: UserSchema.shape.uin.nullable(),
  user_name: UserSchema.shape.name.nullable(),
  user_role: SprocUsersGetDisplayedRoleSchema,

  // left join team_info sproc
  group_id: SprocTeamInfoSchema.shape.id.nullable(),
  group_name: SprocTeamInfoSchema.shape.name.nullable(),
  group_uids: SprocTeamInfoSchema.shape.uid_list.nullable(),

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
  params: VariantSchema.shape.params,
  true_answer: VariantSchema.shape.true_answer,
  options: VariantSchema.shape.options,
  date: z.string().nullable(),
  submitted_answer: SubmissionSchema.shape.submitted_answer,
  partial_scores: SubmissionSchema.shape.partial_scores,
  override_score: SubmissionSchema.shape.override_score,
  credit: SubmissionSchema.shape.credit,
  mode: SubmissionSchema.shape.mode,
  grading_requested_at: z.string().nullable(),
  graded_at: z.string().nullable(),
  score: SubmissionSchema.shape.score,
  correct: SubmissionSchema.shape.correct,
  feedback: SubmissionSchema.shape.feedback,
  // left join rubric_gradings table
  rubric_grading_computed_points: RubricGradingSchema.shape.computed_points.nullable(),
  rubric_grading_adjust_points: RubricGradingSchema.shape.adjust_points.nullable(),
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
});

router.get(
  '/:unsafe_assessment_instance_id(\\d+)',
  asyncHandler(async (req, res) => {
    const data = await sqldb.queryOptionalRow(
      sql.select_assessment_instances,
      {
        course_instance_id: res.locals.course_instance.id,
        unsafe_assessment_id: null,
        unsafe_assessment_instance_id: req.params.unsafe_assessment_instance_id,
      },
      AssessmentInstanceDataSchema,
    );
    if (data == null) {
      res.status(404).send({ message: 'Not Found' });
    } else {
      res.status(200).send(data);
    }
  }),
);

router.get(
  '/:unsafe_assessment_instance_id(\\d+)/instance_questions',
  asyncHandler(async (req, res) => {
    const data = await sqldb.queryRows(
      sql.select_instance_questions,
      {
        course_instance_id: res.locals.course_instance.id,
        unsafe_assessment_instance_id: req.params.unsafe_assessment_instance_id,
      },
      InstanceQuestionDataSchema,
    );
    res.status(200).send(data);
  }),
);

router.get(
  '/:unsafe_assessment_instance_id(\\d+)/submissions',
  asyncHandler(async (req, res) => {
    const data = await sqldb.queryRows(
      sql.select_submissions,
      {
        course_instance_id: res.locals.course_instance.id,
        unsafe_assessment_instance_id: req.params.unsafe_assessment_instance_id,
        unsafe_submission_id: null,
      },
      SubmissionDataSchema,
    );
    res.status(200).send(data);
  }),
);

router.get(
  '/:unsafe_assessment_instance_id(\\d+)/log',
  asyncHandler(async (req, res) => {
    const assessmentInstanceId = await sqldb.queryOptionalRow(
      sql.select_assessment_instance,
      {
        course_instance_id: res.locals.course_instance.id,
        unsafe_assessment_instance_id: req.params.unsafe_assessment_instance_id,
      },
      IdSchema,
    );
    if (assessmentInstanceId == null) {
      res.status(404).send({ message: 'Not Found' });
      return;
    }

    const logs = await assessment.selectAssessmentInstanceLog(assessmentInstanceId, true);
    res.status(200).send(logs);
  }),
);

export default router;
