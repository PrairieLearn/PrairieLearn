import { z } from 'zod';

import { IdSchema } from '@prairielearn/zod';

import { StaffRubricItemSchema, StaffRubricSchema } from './client/safe-db-types.js';
import { RubricGradingItemSchema, RubricGradingSchema, type RubricItem } from './db-types.js';

export const AppliedRubricItemSchema = z.object({
  /** ID of the rubric item to be applied. */
  rubric_item_id: IdSchema,
  /** Score to be applied to the rubric item. Defaults to 1 (100%), i.e., uses the full points assigned to the rubric item. */
  score: z.coerce.number().nullish(),
});
export type AppliedRubricItem = z.infer<typeof AppliedRubricItemSchema>;

export interface RenderedRubricItem {
  rubric_item: RubricItem;
  num_submissions: number;
  description_rendered?: string;
  explanation_rendered?: string;
  grader_note_rendered?: string;
}

export const RubricDataSchema = z.object({
  rubric: StaffRubricSchema,
  rubric_items: z.array(
    z.object({
      rubric_item: StaffRubricItemSchema,
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
      .loose(),
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

export type RubricItemInput = Partial<Omit<RubricItem, 'show_to_students' | 'parent_id'>> & {
  order: number;
  /**
   * Nesting depth (0 for top-level rows). Items are sent in depth-first order,
   * and the parent of each row is derived from the depths, so clients never
   * send `parent_id` directly.
   */
  depth?: number;
};

export const RubricSettingsBodySchema = z.object({
  use_rubric: z.boolean(),
  replace_auto_points: z.boolean(),
  starting_points: z.coerce.number(),
  min_points: z.coerce.number(),
  max_extra_points: z.coerce.number(),
  tag_for_manual_grading: z.boolean().default(false),
  grader_guidelines: z.string().nullable(),
  rubric_items: z
    .array(
      z.object({
        id: z.string().optional(),
        order: z.coerce.number(),
        points: z.coerce.number(),
        description: z.string(),
        explanation: z.string().nullable().optional(),
        grader_note: z.string().nullable().optional(),
        always_show_to_students: z.boolean(),
        depth: z.coerce.number().int().nonnegative().optional(),
        is_group: z.boolean().optional(),
        min_selections: z.coerce.number().int().nullable().optional(),
        max_selections: z.coerce.number().int().nullable().optional(),
        /** The instructor's key for the item; blank or absent uses the automatic key. */
        key_binding: z.string().nullable().optional(),
      }),
    )
    .default([]),
});
