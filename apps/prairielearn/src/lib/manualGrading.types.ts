import { z } from 'zod';

import {
  IdSchema,
  RubricGradingItemSchema,
  RubricGradingSchema,
  type RubricItem,
  RubricItemSchema,
  RubricSchema,
} from './db-types.js';

export const AppliedRubricItemSchema = z.object({
  /** ID of the rubric item to be applied. */
  rubric_item_id: IdSchema,
  /** Score to be applied to the rubric item. Defaults to 1 (100%), i.e., uses the full points assigned to the rubric item. */
  score: z.coerce.number().nullish(),
});
export type AppliedRubricItem = z.infer<typeof AppliedRubricItemSchema>;

export const RenderedRubricItemSchema = z.object({
  rubric_item: RubricItemSchema,
  num_submissions: z.number(),
  description_rendered: z.string().optional(),
  explanation_rendered: z.string().optional(),
  grader_note_rendered: z.string().optional(),
});
export type RenderedRubricItem = z.infer<typeof RenderedRubricItemSchema>;

export const RubricDataSchema = RubricSchema.extend({
  rubric_items: z.array(
    RubricItemSchema.extend({
      num_submissions: z.number(),
      description_rendered: z.string().optional(),
      explanation_rendered: z.string().optional(),
      grader_note_rendered: z.string().optional(),
    }),
  ),
});
export type RubricData = z.infer<typeof RubricDataSchema>;

export const RubricGradingDataSchema = RubricGradingSchema.extend({
  rubric_items: z.record(IdSchema, RubricGradingItemSchema).nullable(),
});
export type RubricGradingData = z.infer<typeof RubricGradingDataSchema>;

export const PartialScoresSchema = z
  .record(
    z.string(),
    z
      .object({
        score: z.coerce.number().nullish(),
        weight: z.coerce.number().nullish(),
      })
      .passthrough(),
  )
  .nullable();

// Some historical cases of points and score ended up with NaN values stored in
// the database. In these cases, manual grading will convert the NaN to zero, so
// that the instructor can still have a chance to fix the issue.
const PointsSchema = z.union([z.nan().transform(() => 0), z.number().nullable()]);

export const SubmissionForScoreUpdateSchema = z.object({
  submission_id: IdSchema.nullable(),
  instance_question_id: IdSchema,
  assessment_instance_id: IdSchema,
  max_points: PointsSchema,
  max_auto_points: PointsSchema,
  max_manual_points: PointsSchema,
  manual_rubric_id: IdSchema.nullable(),
  partial_scores: PartialScoresSchema,
  auto_points: PointsSchema,
  manual_points: PointsSchema,
  manual_rubric_grading_id: IdSchema.nullable(),
  modified_at_conflict: z.boolean(),
});

export const InstanceQuestionToUpdateSchema = RubricGradingSchema.extend({
  assessment_id: IdSchema,
  assessment_instance_id: IdSchema,
  instance_question_id: IdSchema,
  submission_id: IdSchema,
  rubric_settings_changed: z.boolean(),
  applied_rubric_items: RubricGradingItemSchema.array().nullable(),
  rubric_items_changed: z.boolean(),
  is_ai_graded: z.boolean(),
});

export type RubricItemInput = Partial<RubricItem> & { order: number };
